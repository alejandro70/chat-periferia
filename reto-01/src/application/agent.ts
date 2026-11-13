import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Config } from '../config.js';
import type { ModelAdapter } from '../llm/adapter.js';
import { armar_paquete, auditCall, generar_formulario, leer_solicitud, mapear_campos, type Context } from '../tools/proveedor.js';

const registry = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
};
const descriptions: ChatCompletionTool[] = Object.entries(registry).map(([name, tool]) => ({
  type: 'function',
  function: { name, description: tool.description, parameters: z.toJSONSchema(z.object(tool.args)) },
}));

export type VisibleCall = { name: string; arguments: unknown; result: unknown };
export type Session = {
  context: Context;
  messages: ChatCompletionMessageParam[];
  history: { role: string; content: string; toolCalls?: VisibleCall[] }[];
  spent: number;
};

export class Agent {
  private globalSpent = 0;
  constructor(private readonly config: Config, private readonly adapter: ModelAdapter) {}

  async initialize(session: Session): Promise<void> {
    const root = session.context.directory;
    const prompt = await readFile(path.join(root, 'agent', 'prompt.md'), 'utf8');
    const knowledge = await readFile(path.join(root, 'src', 'knowledge', 'registro-proveedor.md'), 'utf8');
    session.messages.push({ role: 'system', content: `${prompt}\n\n${knowledge}` });
  }

  async chat(session: Session, message: string): Promise<{ reply: string; toolCalls: VisibleCall[]; needsConfirmation: boolean }> {
    session.messages.push({ role: 'user', content: message });
    session.history.push({ role: 'user', content: message });
    const calls: VisibleCall[] = [];
    let warning = '';
    for (let iteration = 0; iteration < this.config.MAX_ITERATIONS; iteration++) {
      const estimate = Buffer.byteLength(JSON.stringify(session.messages)) + Buffer.byteLength(JSON.stringify(descriptions)) + 2048;
      const remaining = Math.min(this.config.MAX_SESSION_TOKENS - session.spent, this.config.MAX_GLOBAL_TOKENS - this.globalSpent);
      const outputBudget = Math.min(1024, remaining - estimate);
      if (outputBudget <= 0) { warning = 'Se agotó el presupuesto de tokens.'; break; }
      const reserved = estimate + outputBudget;
      session.spent += reserved;
      this.globalSpent += reserved;
      let response;
      try {
        response = await this.adapter.send(session.messages, descriptions, outputBudget);
      } catch {
        warning = 'El proveedor del modelo no respondió; la sesión continúa disponible.';
        break;
      }
      if (response.usage > reserved) {
        session.spent += response.usage - reserved;
        this.globalSpent += response.usage - reserved;
        warning = 'La respuesta del proveedor superó la reserva de tokens.';
        break;
      }
      session.spent -= reserved - response.usage;
      this.globalSpent -= reserved - response.usage;
      if (!response.calls.length) break;
      session.messages.push({ role: 'assistant', content: response.content,
        tool_calls: response.calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) });
      for (const call of response.calls) {
        let args: unknown;
        let result: string;
        try {
          args = JSON.parse(call.arguments) as unknown;
        } catch {
          args = null;
        }
        if (!Object.hasOwn(registry, call.name)) {
          await auditCall(session.context, '', 'herramienta_desconocida', false);
          result = JSON.stringify({ ok: false, error: 'Herramienta desconocida.' });
        }
        else {
          const tool = registry[call.name as keyof typeof registry];
          result = await tool.execute(args, session.context);
        }
        calls.push({ name: call.name, arguments: args, result: JSON.parse(result) as unknown });
        session.messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      if (iteration === this.config.MAX_ITERATIONS - 1) warning = 'Se alcanzó el límite de iteraciones.';
    }
    const current = [...session.context.cases.entries()];
    const summaries = current.map(([name, state]) => {
      const lines = state.fields.map(field => `${field.etiqueta}: ${field.estado}${field.valor !== undefined ? ` (${String(field.valor)})` : ''}`);
      const pack = state.packageResult;
      return `${name}\n${lines.join('\n')}${pack ? `\nPaquete: ${pack.ruta}\nListo para firma: ${pack.listo_para_firma ? 'sí' : 'no'}\nSoportes ausentes: ${pack.checklist.ausentes.join(', ') || 'ninguno'}` : ''}`;
    });
    const needsConfirmation = current.some(([, state]) => state.fields.some(field => field.estado === 'requiere_confirmacion'));
    const reply = [warning, ...summaries, needsConfirmation ? 'Hay campos pendientes de confirmación.' : '',
      current.length ? 'Consulte el checklist del paquete para conocer el estado para firma.' : 'No hay resultados de caso disponibles.'].filter(Boolean).join('\n\n');
    session.history.push({ role: 'assistant', content: reply, toolCalls: calls });
    session.messages.push({ role: 'assistant', content: reply });
    return { reply, toolCalls: calls, needsConfirmation };
  }
}
