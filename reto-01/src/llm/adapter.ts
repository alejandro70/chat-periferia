import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export type ModelResponse = {
  content: string | null;
  calls: { id: string; name: string; arguments: string }[];
  usage: number;
};

export interface ModelAdapter {
  send(messages: ChatCompletionMessageParam[], tools: ChatCompletionTool[], maxTokens: number): Promise<ModelResponse>;
}

export class OpenAIAdapter implements ModelAdapter {
  private readonly client: OpenAI;
  constructor(key: string, private readonly model: string, timeout: number, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: key, timeout, maxRetries: 0 });
  }

  async send(messages: ChatCompletionMessageParam[], tools: ChatCompletionTool[], maxTokens: number): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model, messages, tools, max_completion_tokens: maxTokens,
    });
    const message = response.choices[0]?.message;
    if (!message || !response.usage) throw new Error('Respuesta incompleta del proveedor.');
    return {
      content: message.content,
      calls: (message.tool_calls ?? []).flatMap(call => call.type === 'function'
        ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : []),
      usage: response.usage.total_tokens,
    };
  }
}
