import { rm } from 'node:fs/promises';
import path from 'node:path';
import { safePath } from './src/infrastructure/files.js';
import { armar_paquete, generar_formulario, leer_solicitud, mapear_campos, type Context } from './src/tools/proveedor.js';

type Result = { ok: true; data: unknown } | { ok: false; error: string };
const root = path.resolve('.');
const output = await safePath(root, 'out');
await rm(output, { recursive: true, force: true });

function reportFailure(name: string, message: string): void {
  console.error(`${name}: ${message}`);
  process.exitCode = 1;
}

for (const caso of ['co-industrias-delta', 'ec-corp-andina', 'hn-agroexport-sula']) {
  const ctx: Context = { directory: root, sessionId: 'demo', cases: new Map() };
  const read = JSON.parse(await leer_solicitud.execute({ caso }, ctx)) as Result;
  if (!read.ok) { reportFailure(caso, read.error); continue; }
  const fields = ctx.cases.get(caso)?.caso.campos;
  if (!fields) { reportFailure(caso, 'no se pudieron leer los campos.'); continue; }
  const mapped = JSON.parse(await mapear_campos.execute({ caso, campos: fields }, ctx)) as Result;
  if (!mapped.ok) { reportFailure(caso, mapped.error); continue; }
  const form = JSON.parse(await generar_formulario.execute({ caso, mapeo: mapped.data }, ctx)) as Result;
  if (!form.ok) { reportFailure(caso, form.error); continue; }
  const pack = JSON.parse(await armar_paquete.execute({ caso }, ctx)) as Result;
  if (!pack.ok) { reportFailure(caso, pack.error); continue; }
  const state = ctx.cases.get(caso);
  if (!state) { reportFailure(caso, 'no se encontró el estado del caso.'); continue; }
  console.log(JSON.stringify({
    caso,
    llenos: state.fields.filter(field => field.estado === 'lleno').length,
    faltantes: state.fields.filter(field => field.estado === 'faltante').length,
    requiere_confirmacion: state.fields.filter(field => field.estado === 'requiere_confirmacion').length,
    paquete: pack.data,
  }));
}
