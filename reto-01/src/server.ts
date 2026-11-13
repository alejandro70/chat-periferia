import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { OpenAIAdapter } from './llm/adapter.js';

const config = loadConfig(process.env);
const app = createApp(config, new OpenAIAdapter(config.OPENAI_API_KEY, config.OPENAI_MODEL, config.LLM_TIMEOUT_MS), path.resolve('.'));
app.listen(config.PORT, () => console.log(`Servidor disponible en puerto ${config.PORT}.`));
