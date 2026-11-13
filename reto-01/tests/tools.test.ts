import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { armar_paquete, generar_formulario, leer_solicitud, mapear_campos, type Context } from '../src/tools/proveedor.js';
import { resolveField } from '../src/application/decisions.js';

type Response = { ok: boolean; data?: unknown; error?: string };

test('herramientas rechazan mapeos manipulados y registran errores sin datos', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-tools-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const ctx: Context = { directory: root, sessionId: 'test', cases: new Map() };
    for (const tool of [leer_solicitud, mapear_campos, generar_formulario, armar_paquete]) {
      const invalid = JSON.parse(await tool.execute({}, ctx)) as Response;
      assert.equal(invalid.ok, false);
      assert.equal(typeof invalid.error, 'string');
    }
    const portal = JSON.parse(await leer_solicitud.execute({ caso: 'pa-logistica-istmo' }, ctx)) as Response;
    assert.equal(portal.ok, false);
    await assert.rejects(stat(path.join(root, 'out', 'pa-logistica-istmo')));
    const name = 'co-industrias-delta';
    const read = JSON.parse(await leer_solicitud.execute({ caso: name }, ctx)) as Response;
    assert.equal(read.ok, true);
    const fields = ctx.cases.get(name)?.caso.campos;
    assert.ok(fields);
    const mapped = JSON.parse(await mapear_campos.execute({ caso: name, campos: fields }, ctx)) as Response;
    assert.equal(mapped.ok, true);
    const tampered = JSON.parse(JSON.stringify(mapped.data)) as { llenos: { valor?: unknown }[] };
    assert.ok(tampered.llenos[0]);
    tampered.llenos[0].valor = 'valor inventado';
    const rejected = JSON.parse(await generar_formulario.execute({ caso: name, mapeo: tampered }, ctx)) as Response;
    assert.equal(rejected.ok, false);
    const invalid = JSON.parse(await armar_paquete.execute({ caso: '../' }, ctx)) as Response;
    assert.equal(invalid.ok, false);
    const log = await readFile(path.join(root, 'out', 'log.jsonl'), 'utf8');
    assert.ok(!log.includes('valor inventado'));
    assert.ok(!log.includes('03100012345'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plantilla inválida informa metadatos sin producir formulario ni paquete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-bad-template-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const name = 'co-industrias-delta';
    await writeFile(path.join(root, 'fixtures', 'reto-01', 'casos', name, 'plantilla-celdas.json'), '[]');
    const ctx: Context = { directory: root, sessionId: 'test', cases: new Map() };
    const result = JSON.parse(await leer_solicitud.execute({ caso: name }, ctx)) as Response;
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Industrias Delta.*CO/);
    await assert.rejects(stat(path.join(root, 'out', name)));
    await rm(path.join(root, 'fixtures', 'reto-01', 'casos', name, 'plantilla-celdas.json'));
    const missing = JSON.parse(await leer_solicitud.execute({ caso: name }, ctx)) as Response;
    assert.equal(missing.ok, false);
    assert.match(missing.error ?? '', /Industrias Delta.*CO/);
    await assert.rejects(stat(path.join(root, 'out', name)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('las descargas de una sesión conservan su propio paquete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-session-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const name = 'ec-corp-andina';
    const contexts: Context[] = ['a', 'b'].map(sessionId => ({ directory: root, sessionId, cases: new Map() }));
    for (const ctx of contexts) {
      assert.equal((JSON.parse(await leer_solicitud.execute({ caso: name }, ctx)) as Response).ok, true);
      const fields = ctx.cases.get(name)?.caso.campos;
      assert.ok(fields);
      assert.equal((JSON.parse(await mapear_campos.execute({ caso: name, campos: fields }, ctx)) as Response).ok, true);
      assert.equal((JSON.parse(await armar_paquete.execute({ caso: name }, ctx)) as Response).ok, true);
    }
    const first = contexts[0];
    const second = contexts[1];
    assert.ok(first && second);
    const before = second.cases.get(name)?.packageFiles?.get('formulario.pdf');
    assert.ok(before);
    await resolveField(first, name, '1', { confirm: true });
    const firstFile = first.cases.get(name)?.packageFiles?.get('formulario.pdf');
    const secondFile = second.cases.get(name)?.packageFiles?.get('formulario.pdf');
    assert.ok(firstFile && secondFile);
    assert.deepEqual(secondFile, before);
    assert.notDeepEqual(firstFile, secondFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('decisiones concurrentes se serializan y los errores no se declaran exitosos', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-decision-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const name = 'hn-agroexport-sula';
    const ctx: Context = { directory: root, sessionId: 'test', cases: new Map() };
    await leer_solicitud.execute({ caso: name }, ctx);
    const current = ctx.cases.get(name);
    assert.ok(current);
    await mapear_campos.execute({ caso: name, campos: current.caso.campos }, ctx);
    await armar_paquete.execute({ caso: name }, ctx);
    const checklist = path.join(root, 'out', name, 'paquete', 'checklist.md');
    await rm(checklist);
    await mkdir(checklist);
    await assert.rejects(resolveField(ctx, name, '1', { confirm: true }));
    assert.equal(current.fields.find(field => field.id === '1')?.estado, 'requiere_confirmacion');
    await rm(checklist, { recursive: true });
    await Promise.all([
      resolveField(ctx, name, '1', { confirm: true }),
      resolveField(ctx, name, '10', { value: 'Referencia manual' }),
    ]);
    assert.equal(current.fields.find(field => field.id === '1')?.estado, 'lleno');
    assert.equal(current.fields.find(field => field.id === '10')?.valor, 'Referencia manual');
    assert.equal(current.packageResult?.listo_para_firma, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
