import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { ModelAdapter, ModelResponse } from '../src/llm/adapter.js';

class FakeModel implements ModelAdapter {
  private step = 0;
  async send(messages: ChatCompletionMessageParam[]): Promise<ModelResponse> {
    let name = '';
    let args: unknown = {};
    if (this.step === 0) { name = 'proveedor_leer_solicitud'; args = { caso: 'ec-corp-andina' }; }
    if (this.step === 1) {
      name = 'proveedor_mapear_campos';
      const last = messages.at(-1);
      if (last?.role !== 'tool' || typeof last.content !== 'string') throw new Error('Respuesta inesperada');
      args = { caso: 'ec-corp-andina', campos: JSON.parse(last.content).data.campos };
    }
    if (this.step === 2) {
      name = 'proveedor_generar_formulario';
      const last = messages.at(-1);
      if (last?.role !== 'tool' || typeof last.content !== 'string') throw new Error('Respuesta inesperada');
      args = { caso: 'ec-corp-andina', mapeo: JSON.parse(last.content).data };
    }
    if (this.step === 3) { name = 'proveedor_armar_paquete'; args = { caso: 'ec-corp-andina' }; }
    this.step++;
    return { content: null, calls: name ? [{ id: `call-${this.step}`, name, arguments: JSON.stringify(args) }] : [], usage: 20 };
  }
}

test('API procesa caso, conserva datos en chat y protege auditoría', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-api-test-'));
  try {
    for (const dir of ['fixtures', 'agent', 'src/knowledge']) {
      await cp(path.resolve(dir), path.join(root, dir), { recursive: true });
    }
    const config = loadConfig({ OPENAI_API_KEY: 'test-secret', OPENAI_MODEL: 'test-model' });
    const server = createApp(config, new FakeModel(), root).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}`;
      const health = await (await fetch(`${url}/api/health`)).text();
      assert.ok(!health.includes('test-secret'));
      assert.equal((await fetch(`${url}/api/sessions/unknown`)).status, 404);
      assert.equal((await fetch(`${url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '' }),
      })).status, 400);
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Procesa ec-corp-andina' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json() as { sessionId: string; reply: string; needsConfirmation: boolean; toolCalls: unknown[] };
      assert.equal(body.needsConfirmation, true);
      assert.equal(body.toolCalls.length, 4);
      assert.match(body.reply, /03100012345/);
      assert.match(body.reply, /Listo para firma: no/);
      const base = `${url}/api/sessions/${body.sessionId}/cases/ec-corp-andina/files`;
      const listing = await (await fetch(base)).json() as { files: string[] };
      assert.ok(listing.files.includes('formulario.pdf'));
      assert.ok(listing.files.includes('rut-2026.txt'));
      assert.equal((await fetch(`${base}/formulario.pdf`)).status, 200);
      assert.equal((await fetch(`${base}/log.jsonl`)).status, 404);
      const confirm = await fetch(`${url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: body.sessionId, message: 'Confirmo RUC', decision: { caso: 'ec-corp-andina', id: '1', confirm: true } }),
      });

      assert.equal(confirm.status, 200);
      const history = await (await fetch(`${url}/api/sessions/${body.sessionId}`)).text();
      assert.ok(history.includes('03100012345'));
      for (const file of ['out/log.jsonl', 'out/ec-corp-andina/log.jsonl']) {
        const log = await readFile(path.join(root, file), 'utf8');
        assert.ok(!log.includes('03100012345'));
        assert.ok(!log.includes('test-secret'));
      }
    } finally {
      server.close();
      await once(server, 'close');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('el fallo del modelo se comunica y mantiene la sesión', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-error-test-'));
  try {
    for (const dir of ['agent', 'src/knowledge']) await cp(path.resolve(dir), path.join(root, dir), { recursive: true });
    const config = loadConfig({ OPENAI_API_KEY: 'test-secret', OPENAI_MODEL: 'test-model', MAX_REQUESTS: '1' });
    const adapter: ModelAdapter = { async send() { throw new Error('test-secret'); } };
    const server = createApp(config, adapter, root).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hola' }),
      });
      const body = await response.json() as { sessionId: string; reply: string };
      assert.match(body.reply, /proveedor del modelo no respondió/);
      assert.ok(!body.reply.includes('test-secret'));
      assert.equal((await fetch(`${url}/api/sessions/${body.sessionId}`)).status, 200);
      assert.equal((await fetch(`${url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: body.sessionId, message: 'otro mensaje' }),
      })).status, 429);
    } finally {
      server.close();
      await once(server, 'close');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
