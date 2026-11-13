import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const configSchema = z.object({
  PORT: positiveInt.max(65535).default(3000),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  LLM_TIMEOUT_MS: positiveInt.default(30000),
  MAX_ITERATIONS: positiveInt.default(10),
  MAX_SESSION_TOKENS: positiveInt.default(200000),
  MAX_GLOBAL_TOKENS: positiveInt.default(200000),
  MAX_CONCURRENT_REQUESTS: positiveInt.default(4),
  MAX_REQUESTS: positiveInt.default(500),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))].join(', ');
    throw new Error(`Configuración inválida o ausente: ${names}.`);
  }
  return parsed.data;
}
