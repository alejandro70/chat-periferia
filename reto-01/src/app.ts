import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import type { Config } from './config.js';
import { Agent, type Session } from './application/agent.js';
import { resolveField } from './application/decisions.js';
import { InputError } from './infrastructure/files.js';
import type { ModelAdapter } from './llm/adapter.js';

const bodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().max(8000),
  decision: z.union([
    z.object({ caso: z.string(), id: z.string(), confirm: z.literal(true) }),
    z.object({ caso: z.string(), id: z.string(), value: z.string().min(1).max(2000) }),
  ]).optional(),
}).refine(data => data.message.trim() || data.decision, 'Mensaje vacío.');

export function createApp(config: Config, adapter: ModelAdapter, directory: string) {
  const app = express();
  const agent = new Agent(config, adapter);
  const sessions = new Map<string, Session>();
  const busy = new Set<string>();
  let requests = 0;
  function availableFiles(id: string, name: string): Map<string, Buffer> {
    const state = sessions.get(id)?.context.cases.get(name);
    if (!state?.packageFiles) throw new InputError('Paquete no disponible en esta sesión.');
    return state.packageFiles;
  }
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, provider: 'OpenAI', model: config.OPENAI_MODEL }));
  app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).json({ error: 'Sesión no encontrada.' }); return; }
    res.json({ history: session.history, cases: [...session.context.cases.entries()].map(([caso, data]) => ({ caso, fields: data.fields, packageReady: !!data.packageResult })) });
  });
  app.get('/api/sessions/:id/cases/:caso/files', async (req, res) => {
    try {
      res.json({ files: [...availableFiles(req.params.id, req.params.caso).keys()] });
    } catch (error) {
      res.status(error instanceof InputError ? 404 : 500).json({ error: error instanceof InputError ? error.message : 'No fue posible consultar el paquete.' });
    }
  });
  app.get('/api/sessions/:id/cases/:caso/files/:file', async (req, res) => {
    try {
      const contents = availableFiles(req.params.id, req.params.caso).get(req.params.file);
      if (!contents) { res.status(404).json({ error: 'Archivo no disponible.' }); return; }
      res.attachment(req.params.file).send(contents);
    } catch (error) {
      res.status(error instanceof InputError ? 404 : 500).json({ error: error instanceof InputError ? error.message : 'No fue posible consultar el archivo.' });
    }
  });
  app.post('/api/chat', async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Solicitud inválida.' }); return; }
    if (requests >= config.MAX_REQUESTS || busy.size >= config.MAX_CONCURRENT_REQUESTS) {
      res.status(429).json({ error: 'Límite de solicitudes alcanzado.' }); return;
    }
    const id = parsed.data.sessionId ?? randomUUID();
    if (busy.has(id)) { res.status(409).json({ error: 'La sesión ya tiene una solicitud en curso.' }); return; }
    let session = sessions.get(id);
    if (!session && parsed.data.sessionId) { res.status(404).json({ error: 'Sesión no encontrada.' }); return; }
    requests++;
    busy.add(id);
    try {
      if (!session) {
        session = { context: { directory, sessionId: id, cases: new Map() }, messages: [], history: [], spent: 0 };
        await agent.initialize(session);
        sessions.set(id, session);
      }
      if (parsed.data.decision) {
        const decision = parsed.data.decision;
        await resolveField(session.context, decision.caso, decision.id, 'confirm' in decision ? { confirm: true } : { value: decision.value });
        const pack = session.context.cases.get(decision.caso)?.packageResult;
        const reply = `Campo actualizado y paquete regenerado. Listo para firma: ${pack?.listo_para_firma ? 'sí' : 'no'}.`;
        session.history.push({ role: 'user', content: parsed.data.message });
        session.history.push({ role: 'assistant', content: reply });
        session.messages.push({ role: 'user', content: parsed.data.message });
        session.messages.push({ role: 'assistant', content: reply });
        res.json({ sessionId: id, reply, toolCalls: [], needsConfirmation: [...session.context.cases.values()].some(c => c.fields.some(f => f.estado === 'requiere_confirmacion')) });
      } else {
        const result = await agent.chat(session, parsed.data.message);
        res.json({ sessionId: id, ...result });
      }
    } catch (error) {
      res.status(error instanceof InputError ? 400 : 500).json({ error: error instanceof InputError ? error.message : 'No fue posible procesar la solicitud.' });
    } finally {
      busy.delete(id);
    }
  });
  app.use(express.static(path.join(directory, 'web')));
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) { next(error); return; }
    if (error instanceof SyntaxError || (error instanceof Error && 'status' in error && error.status === 413)) {
      res.status(400).json({ error: 'Solicitud inválida o demasiado grande.' });
      return;
    }
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  });
  return app;
}
