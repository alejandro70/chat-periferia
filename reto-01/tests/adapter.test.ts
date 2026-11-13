import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import OpenAI from 'openai';
import { OpenAIAdapter } from '../src/llm/adapter.js';

test('adaptador traduce respuesta y aplica timeout sin red externa', async () => {
  let slow = false;
  const server = createServer((_request, response) => {
    const send = () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: 'local', object: 'chat.completion', created: 1, model: 'test',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }));
    };
    if (slow) setTimeout(send, 200);
    else send();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const options = { apiKey: 'local-test', baseURL: `http://127.0.0.1:${address.port}/v1`, maxRetries: 0 };
    const adapter = new OpenAIAdapter('local-test', 'test', 2000, new OpenAI({ ...options, timeout: 2000 }));
    const result = await adapter.send([{ role: 'user', content: 'hola' }], [], 100);
    assert.equal(result.usage, 5);
    assert.equal(result.content, 'ok');
    slow = true;
    const fastTimeout = new OpenAIAdapter('local-test', 'test', 20, new OpenAI({ ...options, timeout: 20 }));
    await assert.rejects(fastTimeout.send([{ role: 'user', content: 'hola' }], [], 100));
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
