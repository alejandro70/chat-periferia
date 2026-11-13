import { InputError } from '../infrastructure/files.js';
import { buildPackage, generateForm, snapshotPackage } from '../infrastructure/documents.js';
import type { Context } from '../tools/proveedor.js';
import { withCaseLock } from './locks.js';

export async function resolveField(ctx: Context, name: string, id: string, decision: { confirm: true } | { value: string }): Promise<void> {
  return withCaseLock(ctx.directory, name, async () => {
    const state = ctx.cases.get(name);
    if (!state) throw new InputError('Caso no disponible en esta sesión.');
    const field = state.fields.find(item => item.id === id);
    if (!field || field.estado === 'lleno') throw new InputError('El campo no requiere validación.');
    const old = { ...field };
    if ('confirm' in decision) {
      if (field.estado !== 'requiere_confirmacion' || field.valor === undefined) {
        throw new InputError('No existe un valor candidato para confirmar.');
      }
    } else {
      if (!decision.value.trim()) throw new InputError('El valor corregido no puede estar vacío.');
      field.valor = decision.value;
      field.origenManual = true;
      delete field.ruta;
    }
    field.estado = 'lleno';
    delete field.motivo;
    try {
      await generateForm(ctx.directory, name, state.caso, state.fields);
      const pack = await buildPackage(ctx.directory, name, state.caso, state.fields);
      const files = await snapshotPackage(ctx.directory, name, state.caso, pack.checklist.presentes);
      state.packageResult = pack;
      state.packageFiles = files;
    } catch (error) {
      Object.assign(field, old);
      if (old.valor === undefined) delete field.valor;
      if (old.ruta === undefined) delete field.ruta;
      if (old.origenManual === undefined) delete field.origenManual;
      throw error;
    }
  });
}
