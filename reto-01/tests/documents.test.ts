import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { mapFields, readCase } from '../src/domain/cases.js';
import { buildPackage, generateForm } from '../src/infrastructure/documents.js';
import { resolveField } from '../src/application/decisions.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('genera celdas, deja pendiente el identificador y arma el paquete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-proveedor-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const name = 'hn-agroexport-sula';
    const caso = await readCase(root, name);
    const fields = await mapFields(root, caso);
    await generateForm(root, name, caso, fields);
    const result = await buildPackage(root, name, caso, fields);
    assert.equal(result.listo_para_firma, false);
    assert.ok(result.checklist.pendientes.includes('RTN'));
    assert.ok(result.checklist.presentes.includes('parafiscales'));
    for (const support of ['camara-comercio-2026-08.txt', 'rut-2026.txt', 'parafiscales-2026-07.txt']) {
      assert.deepEqual(
        await readFile(path.join(root, 'out', name, 'paquete', support)),
        await readFile(path.join(root, 'fixtures', 'reto-01', 'repositorio', 'soportes', support)),
      );
    }
    assert.deepEqual(
      await readFile(path.join(root, 'out', name, 'paquete', 'formulario.xlsx')),
      await readFile(path.join(root, 'out', name, 'formulario.xlsx')),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(root, 'out', name, 'formulario.xlsx'));
    assert.equal(workbook.getWorksheet('Registro')?.getCell('A3').value, 'RTN');
    assert.ok(!workbook.getWorksheet('Registro')?.getCell('B3').value);
    const draft = await readFile(path.join(root, 'out', name, 'paquete', 'borrador-correo.md'), 'utf8');
    assert.ok(!draft.includes('03100012345'));
    const fieldsBefore = await readFile(path.join(root, 'fixtures', 'reto-01', 'repositorio', 'maestro.json'), 'utf8');
    const ctx = { directory: root, sessionId: 'session', cases: new Map([[name, { caso, fields }]]) };
    await resolveField(ctx, name, '1', { confirm: true });
    const updated = new ExcelJS.Workbook();
    await updated.xlsx.readFile(path.join(root, 'out', name, 'formulario.xlsx'));
    assert.equal(updated.getWorksheet('Registro')?.getCell('B3').value, '900123456');
    assert.equal((await buildPackage(root, name, caso, fields)).listo_para_firma, true);
    await resolveField(ctx, name, '10', { value: 'Referencia manual' });
    const corrected = new ExcelJS.Workbook();
    await corrected.xlsx.readFile(path.join(root, 'out', name, 'formulario.xlsx'));
    assert.equal(corrected.getWorksheet('Registro')?.getCell('B12').value, 'Referencia manual');
    assert.equal(fields.find(field => field.id === '10')?.origenManual, true);
    assert.equal(await readFile(path.join(root, 'fixtures', 'reto-01', 'repositorio', 'maestro.json'), 'utf8'), fieldsBefore);
    await rm(path.join(root, 'fixtures', 'reto-01', 'repositorio', 'soportes', 'parafiscales-2026-07.txt'));
    const missing = await buildPackage(root, name, caso, fields);
    assert.equal(missing.listo_para_firma, false);
    assert.ok(missing.checklist.ausentes.includes('parafiscales'));
    await assert.rejects(readFile(path.join(root, 'out', name, 'paquete', 'parafiscales-2026-07.txt')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cada hoja y celda Excel coincide con la plantilla de CO y HN', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-celdas-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    for (const name of ['co-industrias-delta', 'hn-agroexport-sula']) {
      const caso = await readCase(root, name);
      const fields = await mapFields(root, caso);
      await generateForm(root, name, caso, fields);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path.join(root, 'out', name, 'formulario.xlsx'));
      for (const template of caso.campos) {
        assert.ok(template.hoja && template.celda_etiqueta && template.celda_valor);
        const sheet = workbook.getWorksheet(template.hoja);
        assert.ok(sheet);
        assert.equal(sheet.getCell(template.celda_etiqueta).value, template.etiqueta);
        const mapped = fields.find(field => field.id === template.id);
        const expected = mapped?.estado === 'lleno' ? mapped.valor : null;
        const actual = sheet.getCell(template.celda_valor).value;
        assert.equal(actual === '' ? null : actual, expected ?? null);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('el PDF conserva etiquetas y orden sin escribir identificador pendiente', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-pdf-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const name = 'ec-corp-andina';
    const caso = await readCase(root, name);
    const fields = await mapFields(root, caso);
    await generateForm(root, name, caso, fields);
    const bytes = new Uint8Array(await readFile(path.join(root, 'out', name, 'formulario.pdf')));
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    let position = -1;
    for (const field of caso.campos) {
      const next = text.indexOf(field.etiqueta, position + 1);
      assert.ok(next > position, `Falta o está fuera de orden: ${field.etiqueta}`);
      position = next;
    }
    const normalized = text.replace(/\s+/g, ' ');
    for (const field of fields.filter(item => item.estado === 'lleno')) {
      assert.ok(normalized.includes(String(field.valor).replace(/\s+/g, ' ')), `Falta valor de ${field.etiqueta}`);
    }
    assert.ok(!text.includes('900123456'));
    await pdf.destroy();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
