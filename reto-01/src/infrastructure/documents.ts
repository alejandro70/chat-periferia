import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { z } from 'zod';
import type { Case, MappingField } from '../domain/cases.js';
import { InputError, outputDirectory, readJson, safePath } from './files.js';

const supportSchema = z.array(z.object({
  tipo: z.string().min(1), archivo: z.string().min(1),
}));

async function writeAtomic(file: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

export async function generateForm(root: string, name: string, data: Case, fields: MappingField[]): Promise<{ ruta: string; formato: string }> {
  await outputDirectory(root, name);
  const byId = new Map(fields.map(field => [field.id, field]));
  const values = data.campos.map(field => {
    const mapped = byId.get(field.id);
    if (!mapped || mapped.etiqueta !== field.etiqueta) throw new InputError('Mapeo incompleto.');
    return mapped.estado === 'lleno' && mapped.valor !== undefined ? mapped.valor : '';
  });
  if (data.solicitud.formato === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date('2000-01-01T00:00:00Z');
    workbook.modified = workbook.created;
    for (const [index, field] of data.campos.entries()) {
      if (!field.hoja || !field.celda_etiqueta || !field.celda_valor) throw new InputError('Plantilla Excel inválida.');
      const sheet = workbook.getWorksheet(field.hoja) ?? workbook.addWorksheet(field.hoja);
      sheet.getCell(field.celda_etiqueta).value = field.etiqueta;
      sheet.getCell(field.celda_valor).value = values[index] ?? '';
    }
    const bytes = await workbook.xlsx.writeBuffer();
    const file = await safePath(root, 'out', name, 'formulario.xlsx');
    await writeAtomic(file, new Uint8Array(bytes));
    return { ruta: `out/${name}/formulario.xlsx`, formato: 'xlsx' };
  }
  if (data.solicitud.formato !== 'pdf') throw new InputError('Formato fuera de alcance.');
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2000-01-01T00:00:00Z'));
  pdf.setModificationDate(new Date('2000-01-01T00:00:00Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const [index, field] of data.campos.entries()) {
    const text = `${field.etiqueta}: ${values[index] ?? ''}`;
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 11) > 500 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    for (const part of lines) {
      if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
      page.drawText(part, { x: 45, y, size: 11, font });
      y -= 18;
    }
  }
  const file = await safePath(root, 'out', name, 'formulario.pdf');
  await writeAtomic(file, await pdf.save());
  return { ruta: `out/${name}/formulario.pdf`, formato: 'pdf' };
}

export async function buildPackage(root: string, name: string, data: Case, fields: MappingField[]): Promise<{
  ruta: string; listo_para_firma: boolean; checklist: { presentes: string[]; ausentes: string[]; faltantes: string[]; pendientes: string[] };
}> {
  await outputDirectory(root, name);
  const packageDir = await safePath(root, 'out', name, 'paquete');
  await mkdir(packageDir, { recursive: true });
  const index = supportSchema.safeParse(await readJson(root, 'fixtures', 'reto-01', 'repositorio', 'soportes', 'index.json'));
  if (!index.success) throw new InputError('Índice de soportes inválido.');
  const presentes: string[] = [];
  const ausentes: string[] = [];
  for (const type of data.soportes) {
    const support = index.data.find(item => item.tipo === type);
    if (!support || path.basename(support.archivo) !== support.archivo) {
      if (support) throw new InputError('Ruta de soporte inválida.');
      ausentes.push(type);
      continue;
    }
    const source = await safePath(root, 'fixtures', 'reto-01', 'repositorio', 'soportes', support.archivo);
    const destination = await safePath(root, 'out', name, 'paquete', support.archivo);
    try {
      if (!(await stat(source)).isFile()) throw new InputError('El soporte no es un archivo.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await rm(destination, { force: true });
        ausentes.push(type);
        continue;
      }
      throw error;
    }
    await copyFile(source, destination);
    presentes.push(type);
  }
  const faltantes = fields.filter(f => f.estado === 'faltante').map(f => f.etiqueta);
  const pendientes = fields.filter(f => f.estado === 'requiere_confirmacion').map(f => f.etiqueta);
  const listo_para_firma = ausentes.length === 0 && pendientes.length === 0;
  const ext = data.solicitud.formato === 'xlsx' ? 'xlsx' : 'pdf';
  const form = await safePath(root, 'out', name, `formulario.${ext}`);
  const packageForm = await safePath(root, 'out', name, 'paquete', `formulario.${ext}`);
  await copyFile(form, packageForm);
  const checklist = { presentes, ausentes, faltantes, pendientes };
  const text = Object.entries(checklist).map(([key, values]) => `## ${key}\n${values.length ? values.map(v => `- ${v}`).join('\n') : '- Ninguno'}`).join('\n\n');
  await writeAtomic(await safePath(root, 'out', name, 'paquete', 'checklist.md'), `# Checklist\n\n${text}\n\nListo para firma: ${listo_para_firma ? 'sí' : 'no'}\n`);
  await writeAtomic(await safePath(root, 'out', name, 'paquete', 'borrador-correo.md'),
    `# Borrador de correo\n\nEstimados ${data.solicitud.cliente}:\n\nAdjuntamos el formulario y los soportes disponibles para su revisión.\n\nCordialmente.\n`);
  return { ruta: `out/${name}/paquete`, listo_para_firma, checklist };
}

export async function snapshotPackage(root: string, name: string, data: Case, present: string[]): Promise<Map<string, Buffer>> {
  const index = supportSchema.safeParse(await readJson(root, 'fixtures', 'reto-01', 'repositorio', 'soportes', 'index.json'));
  if (!index.success) throw new InputError('Índice de soportes inválido.');
  const ext = data.solicitud.formato === 'xlsx' ? 'xlsx' : 'pdf';
  const files = [`formulario.${ext}`, 'checklist.md', 'borrador-correo.md',
    ...index.data.filter(item => present.includes(item.tipo)).map(item => item.archivo)];
  const result = new Map<string, Buffer>();
  for (const file of files) {
    if (path.basename(file) !== file) throw new InputError('Ruta de soporte inválida.');
    result.set(file, await readFile(await safePath(root, 'out', name, 'paquete', file)));
  }
  return result;
}
