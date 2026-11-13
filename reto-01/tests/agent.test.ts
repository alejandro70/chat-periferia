import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { Agent, type Session } from '../src/application/agent.js';
import { loadConfig } from '../src/config.js';
import type { ModelAdapter, ModelResponse } from '../src/llm/adapter.js';

function session(id: string): Session {
  return { context: { directory: path.resolve('.'), sessionId: id, cases: new Map() }, messages: [], history: [], spent: 0 };
}
const answer: ModelResponse = { content: 'VALOR INVENTADO', calls: [], usage: 1 };

test('el texto del modelo no puede introducir valores sin fuente', async () => {
  const config = loadConfig({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test' });
  const adapter: ModelAdapter = { async send() { return answer; } };
  const result = await new Agent(config, adapter).chat(session('one'), 'hola');
  assert.ok(!result.reply.includes('VALOR INVENTADO'));
});

test('presupuesto agotado se informa sin llamar al proveedor', async () => {
  const config = loadConfig({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test', MAX_SESSION_TOKENS: '1' });
  let called = false;
  const adapter: ModelAdapter = { async send() { called = true; return answer; } };
  const current = session('one');
  const result = await new Agent(config, adapter).chat(current, 'hola');
  assert.match(result.reply, /presupuesto de tokens/);
  assert.equal(called, false);
  assert.equal(current.history.length, 2);
});

test('las solicitudes concurrentes reservan el presupuesto global', async () => {
  const config = loadConfig({
    OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test',
    MAX_SESSION_TOKENS: '200000', MAX_GLOBAL_TOKENS: '150000',
  });
  let finish: ((value: ModelResponse) => void) | undefined;
  let called = 0;
  const adapter: ModelAdapter = {
    send() { called++; return new Promise<ModelResponse>(resolve => { finish = resolve; }); },
  };
  const agent = new Agent(config, adapter);
  const message = 'x'.repeat(100000);
  const first = agent.chat(session('one'), message);
  const second = await agent.chat(session('two'), message);
  assert.equal(called, 1);
  assert.match(second.reply, /presupuesto de tokens/);
  assert.ok(finish);
  finish(answer);
  await first;
});

test('el modelo no puede confirmar ni enviar y se informa el límite de iteraciones', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-agent-test-'));
  try {
    const config = loadConfig({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test', MAX_ITERATIONS: '1' });
    const adapter: ModelAdapter = {
      async send() {
        return { content: null, usage: 1, calls: [{ id: '1', name: 'proveedor_simular_envio', arguments: '{"caso":"co-industrias-delta","confirmado":true}' }] };
      },
    };
    const current = session('one');
    current.context.directory = root;
    const result = await new Agent(config, adapter).chat(current, 'enviar');
    assert.match(result.reply, /límite de iteraciones/);
    assert.deepEqual(result.toolCalls[0]?.result, { ok: false, error: 'Herramienta desconocida.' });
    await assert.rejects(stat(path.join(root, 'out', 'co-industrias-delta')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
