import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mapFields, readCase } from '../src/domain/cases.js';
import { caseName } from '../src/infrastructure/files.js';

const root = path.resolve('.');

test('mapea los casos desde el maestro y no inventa faltantes', async () => {
  for (const id of ['co-industrias-delta', 'ec-corp-andina', 'hn-agroexport-sula']) {
    const data = await readCase(root, id);
    const mapping = await mapFields(root, data);
    assert.equal(mapping.length, data.campos.length);
    assert.equal(new Set(mapping.map(field => field.id)).size, mapping.length);
    assert.ok(mapping.filter(field => field.estado === 'faltante').every(field => field.valor === undefined));
    if (data.solicitud.pais !== 'CO') {
      const tax = mapping.find(field => field.ruta === 'nit');
      assert.equal(tax?.estado, 'requiere_confirmacion');
      assert.equal(tax?.motivo, 'identificador extranjero');
    }
    const bank = mapping.find(field => field.ruta === 'banco.numero_cuenta');
    if (bank) assert.equal(bank.valor, '03100012345');
  }
});

test('rechaza portal y nombres que salen de la carpeta de casos', async () => {
  await assert.rejects(readCase(root, 'pa-logistica-istmo'), /fuera de alcance/);
  await assert.rejects(readCase(root, 'caso-inexistente'), /archivo requerido/);
  assert.throws(() => caseName('../maestro'), /inválido/);
});

test('identificador ambiguo requiere confirmación y propone el equivalente', async () => {
  const caso = await readCase(root, 'co-industrias-delta');
  caso.campos = [{ id: '0', etiqueta: 'Identificación tributaria' }];
  const [field] = await mapFields(root, caso);
  assert.equal(field?.estado, 'requiere_confirmacion');
  assert.match(field?.motivo ?? '', /equivalente: NIT/);
});
