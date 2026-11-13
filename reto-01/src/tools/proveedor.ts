import { appendFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { caseName, InputError, safePath } from '../infrastructure/files.js';
import { type Case, type MappingField, mapFields, readCase } from '../domain/cases.js';
import { buildPackage, generateForm, snapshotPackage } from '../infrastructure/documents.js';
import { withCaseLock } from '../application/locks.js';

export type CaseState = {
  caso: Case;
  fields: MappingField[];
  packageResult?: Awaited<ReturnType<typeof buildPackage>>;
  packageFiles?: Map<string, Buffer>;
};
export type Context = { directory: string; sessionId: string; cases: Map<string, CaseState> };
const caso = z.string().describe('Nombre del caso en fixtures/reto-01/casos/');
const field = z.object({
  id: z.string(), etiqueta: z.string(),
  estado: z.enum(['lleno', 'faltante', 'requiere_confirmacion']),
  ruta: z.string().optional(), valor: z.union([z.string(), z.number(), z.boolean()]).optional(),
  motivo: z.string().optional(), origenManual: z.boolean().optional(),
});
const mapping = z.object({ llenos: z.array(field), faltantes: z.array(field), requiere_confirmacion: z.array(field) });
type Mapeo = z.infer<typeof mapping>;

function split(fields: MappingField[]): Mapeo {
  return {
    llenos: fields.filter(f => f.estado === 'lleno'),
    faltantes: fields.filter(f => f.estado === 'faltante'),
    requiere_confirmacion: fields.filter(f => f.estado === 'requiere_confirmacion'),
  };
}

function state(ctx: Context, name: string): CaseState {
  const found = ctx.cases.get(name);
  if (!found) throw new InputError('Primero debe leer y mapear el caso.');
  return found;
}

export async function auditCall(ctx: Context, name: string, tool: string, ok: boolean): Promise<void> {
  const log = JSON.stringify({ ts: new Date().toISOString(), herramienta: tool, ok, resumen: ok ? 'Operación completada' : 'Operación fallida' }) + '\n';
  const out = await safePath(ctx.directory, 'out');
  await mkdir(out, { recursive: true });
  await appendFile(await safePath(ctx.directory, 'out', 'log.jsonl'), log);
  try {
    caseName(name);
  } catch (error) {
    if (error instanceof InputError) return;
    throw error;
  }
  if (!ctx.cases.has(name)) return;
  const dir = await safePath(ctx.directory, 'out', name);
  await mkdir(dir, { recursive: true });
  await appendFile(await safePath(ctx.directory, 'out', name, 'log.jsonl'), log);
}

function defineTool<T extends z.ZodRawShape, R>(tool: string, description: string, args: T,
  run: (args: z.infer<z.ZodObject<T>>, ctx: Context) => Promise<R>) {
  const schema = z.object(args);
  return {
    description, args,
    async execute(input: unknown, ctx: Context): Promise<string> {
      const parsed = schema.safeParse(input);
      let ok = false;
      let result: { ok: true; data: R } | { ok: false; error: string };
      if (!parsed.success) result = { ok: false, error: 'Argumentos de herramienta inválidos.' };
      else {
        try {
          result = { ok: true, data: await run(parsed.data, ctx) };
          ok = true;
        } catch (error) {
          result = { ok: false, error: error instanceof InputError ? error.message : 'No fue posible ejecutar la herramienta.' };
        }
      }
      const rawName = typeof input === 'object' && input !== null && 'caso' in input && typeof input.caso === 'string' ? input.caso : '';
      try {
        await auditCall(ctx, rawName, tool, ok);
      } catch {
        return JSON.stringify({ ok: false, error: 'No fue posible registrar la auditoría.' });
      }
      return JSON.stringify(result);
    },
  };
}

export const leer_solicitud = defineTool('proveedor_leer_solicitud', 'Lee la solicitud y los campos de un caso.',
  { caso }, async ({ caso: name }, ctx) => {
    const data = await readCase(ctx.directory, name);
    if (!ctx.cases.has(name)) ctx.cases.set(name, { caso: data, fields: [] });
    return { pais: data.solicitud.pais, cliente: data.solicitud.cliente, formato: data.solicitud.formato,
      campos: data.campos, soportes: data.soportes };
  });

export const mapear_campos = defineTool('proveedor_mapear_campos', 'Cruza los campos solicitados con el maestro local.',
  { caso, campos: z.array(z.object({ id: z.string(), etiqueta: z.string() }).passthrough()).describe('Campos de la solicitud') },
  async ({ caso: name, campos }, ctx) => {
    const current = state(ctx, name);
    if (campos.length !== current.caso.campos.length || campos.some((f, index) =>
      f.id !== current.caso.campos[index]?.id || f.etiqueta !== current.caso.campos[index]?.etiqueta)) {
      throw new InputError('Los campos no corresponden a la solicitud.');
    }
    if (current.fields.length === 0) current.fields = await mapFields(ctx.directory, current.caso);
    return split(current.fields);
  });

export const generar_formulario = defineTool('proveedor_generar_formulario', 'Genera el formulario con el mapeo validado.',
  { caso, mapeo: mapping.describe('Mapeo autorizado del caso') }, async ({ caso: name, mapeo }, ctx) => {
    const current = state(ctx, name);
    if (current.fields.length === 0 || JSON.stringify(mapeo) !== JSON.stringify(split(current.fields))) {
      throw new InputError('El mapeo no coincide con el estado autorizado.');
    }
    return withCaseLock(ctx.directory, name, () => generateForm(ctx.directory, name, current.caso, current.fields));
  });

export const armar_paquete = defineTool('proveedor_armar_paquete', 'Prepara el paquete con soportes y checklist.',
  { caso }, async ({ caso: name }, ctx) => {
    const current = state(ctx, name);
    if (current.fields.length === 0) throw new InputError('Primero debe mapear los campos.');
    const result = await withCaseLock(ctx.directory, name, async () => {
      await generateForm(ctx.directory, name, current.caso, current.fields);
      const pack = await buildPackage(ctx.directory, name, current.caso, current.fields);
      const files = await snapshotPackage(ctx.directory, name, current.caso, pack.checklist.presentes);
      current.packageFiles = files;
      return pack;
    });
    current.packageResult = result;
    return result;
  });
