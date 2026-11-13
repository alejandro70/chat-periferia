import { z } from 'zod';
import { caseName, InputError, readJson } from '../infrastructure/files.js';

const requestSchema = z.object({
  id: z.string(), pais: z.string(), cliente: z.string(), formato: z.enum(['xlsx', 'pdf', 'portal']),
});
const cellSchema = z.object({
  hoja: z.string().min(1), celda_etiqueta: z.string().regex(/^[A-Z]+[1-9]\d*$/),
  celda_valor: z.string().regex(/^[A-Z]+[1-9]\d*$/), etiqueta: z.string().min(1),
});
const fieldSchema = z.object({ etiqueta: z.string().min(1), obligatorio: z.boolean() });
const glossarySchema = z.record(z.string(), z.string());

export type Request = z.infer<typeof requestSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type TemplateField = { id: string; etiqueta: string; hoja?: string; celda_etiqueta?: string; celda_valor?: string };
export type Case = { solicitud: Request; campos: TemplateField[]; soportes: string[] };
export type MappingField = {
  id: string;
  etiqueta: string;
  estado: 'lleno' | 'faltante' | 'requiere_confirmacion';
  ruta?: string;
  valor?: string | number | boolean;
  motivo?: string;
  origenManual?: boolean;
};

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InputError(message);
  return result.data;
}

export async function readCase(root: string, name: string): Promise<Case> {
  caseName(name);
  const dir = ['fixtures', 'reto-01', 'casos', name];
  const solicitud = parse(requestSchema, await readJson(root, ...dir, 'solicitud.json'), 'Solicitud inválida.');
  if (solicitud.formato === 'portal') throw new InputError('Formato portal fuera de alcance.');
  const templateName = solicitud.formato === 'xlsx' ? 'plantilla-celdas.json' : 'plantilla-campos.json';
  let campos: TemplateField[];
  try {
    const raw = await readJson(root, ...dir, templateName);
    campos = solicitud.formato === 'xlsx'
      ? parse(z.array(cellSchema).min(1), raw, 'Plantilla Excel inválida.').map((field, index) => ({ ...field, id: String(index) }))
      : parse(z.array(fieldSchema).min(1), raw, 'Plantilla PDF inválida.').map((field, index) => ({ id: String(index), etiqueta: field.etiqueta }));
  } catch (error) {
    if (error instanceof InputError) {
      throw new InputError(`Plantilla ausente o corrupta para ${solicitud.cliente} (${solicitud.pais}).`);
    }
    throw error;
  }
  const soportes = parse(z.array(z.string()), await readJson(root, ...dir, 'soportes-exigidos.json'), 'Lista de soportes inválida.');
  return { solicitud, campos, soportes };
}

function nestedValue(value: unknown, route: string): unknown {
  let current: unknown = value;
  for (const part of route.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export async function mapFields(root: string, caso: Case): Promise<MappingField[]> {
  const base = ['fixtures', 'reto-01'];
  const glossary = parse(glossarySchema, await readJson(root, ...base, 'glosario-campos.json'), 'Glosario inválido.');
  const master = await readJson(root, ...base, 'repositorio', 'maestro.json');
  return caso.campos.map(({ id, etiqueta }) => {
    const ruta = Object.hasOwn(glossary, etiqueta) ? glossary[etiqueta] : undefined;
    if (!ruta) return { id, etiqueta, estado: 'faltante', motivo: 'Sin campo en el glosario; solicite el dato.' };
    const valor = nestedValue(master, ruta);
    if (valor === undefined || valor === null || valor === '' ||
        !['string', 'number', 'boolean'].includes(typeof valor)) {
      return { id, etiqueta, estado: 'faltante', ruta, motivo: 'No existe un valor en el maestro.' };
    }
    if (typeof valor !== 'string' && typeof valor !== 'number' && typeof valor !== 'boolean') {
      throw new InputError('Tipo de dato maestro inválido.');
    }
    const ambiguous = etiqueta === 'Identificación tributaria' || etiqueta === 'Número de identificación fiscal';
    const foreign = ruta === 'nit' && caso.solicitud.pais !== 'CO';
    if (ambiguous || foreign) {
      const countryLabel: Record<string, string> = { CO: 'NIT', EC: 'RUC', PE: 'RUC', PA: 'RUC', HN: 'RTN' };
      return { id, etiqueta, estado: 'requiere_confirmacion', ruta, valor,
        motivo: [foreign ? 'identificador extranjero' : '', ambiguous ? `equivalente: ${countryLabel[caso.solicitud.pais] ?? 'identificador tributario'}` : ''].filter(Boolean).join('; ') };
    }
    return { id, etiqueta, estado: 'lleno', ruta, valor };
  });
}
