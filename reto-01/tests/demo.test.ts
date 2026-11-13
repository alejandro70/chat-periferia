import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

test('demo continúa tras un caso inválido y devuelve error sin clave', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-demo-test-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const invalid = path.join(root, 'fixtures', 'reto-01', 'casos', 'co-industrias-delta', 'plantilla-celdas.json');
    await writeFile(invalid, '[]');
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_MODEL;
    const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('demo.ts')], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /co-industrias-delta/);
    assert.match(result.stdout, /ec-corp-andina/);
    assert.match(result.stdout, /hn-agroexport-sula/);
    assert.equal(await readFile(invalid, 'utf8'), '[]');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('demo conserva fixtures y produce artefactos deterministas salvo timestamps', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'registro-demo-repeat-'));
  try {
    await cp(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
    const snapshot = async (directory: string, excel: boolean): Promise<Record<string, string>> => {
      const entries: Record<string, string> = {};
      async function walk(current: string): Promise<void> {
        for (const entry of await readdir(current, { withFileTypes: true })) {
          const file = path.join(current, entry.name);
          if (entry.isDirectory()) await walk(file);
          else if (entry.isFile() && entry.name !== 'log.jsonl') {
            if (excel && file.endsWith('.xlsx')) {
              const book = new ExcelJS.Workbook();
              await book.xlsx.readFile(file);
              entries[path.relative(directory, file)] = JSON.stringify(book.model);
            } else {
              entries[path.relative(directory, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
            }
          }
        }
      }
      await walk(directory);
      return entries;
    };
    const fixtures = path.join(root, 'fixtures');
    const before = await snapshot(fixtures, false);
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_MODEL;
    const run = () => spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('demo.ts')], { cwd: root, env, encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const output = await snapshot(path.join(root, 'out'), true);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(await snapshot(path.join(root, 'out'), true), output);
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(await snapshot(fixtures, false), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
