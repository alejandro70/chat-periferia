import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { safePath } from '../src/infrastructure/files.js';

test('configuración inválida informa nombres sin mostrar claves', () => {
  assert.throws(() => loadConfig({}), /OPENAI_API_KEY.*OPENAI_MODEL/);
  assert.throws(() => loadConfig({ OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'model', PORT: 'invalid' }), error =>
    error instanceof Error && error.message.includes('PORT') && !error.message.includes('secret'));
});

test('rutas fuera del proyecto y enlaces de escape se rechazan', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-path-test-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'registro-outside-test-'));
  try {
    await assert.rejects(safePath(root, '..', path.basename(outside)), /fuera del proyecto/);
    await assert.rejects(safePath(root, path.parse(root).root), /fuera del proyecto/);
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(safePath(root, 'escape', 'file'), /enlaces simbólicos/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
