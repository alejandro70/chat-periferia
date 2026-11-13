import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export class InputError extends Error {}

export function caseName(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new InputError('Identificador de caso inválido.');
  }
  return value;
}

export async function safePath(root: string, ...segments: string[]): Promise<string> {
  const base = await realpath(root);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new InputError('Ruta fuera del proyecto.');
  }
  let current = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new InputError('No se permiten enlaces simbólicos en rutas de datos.');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return target;
}

export async function readJson(root: string, ...segments: string[]): Promise<unknown> {
  const file = await safePath(root, ...segments);
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError('El archivo JSON está corrupto.');
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new InputError('No se encontró un archivo requerido.');
    }
    throw error;
  }
}

export async function outputDirectory(root: string, name: string): Promise<string> {
  const target = await safePath(root, 'out', caseName(name));
  await mkdir(target, { recursive: true });
  return target;
}
