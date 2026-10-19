import OpenAI from 'openai';
import { cleanSuggestion, NAMING_PROMPT, NAMING_TIMEOUT_MS, type NameSuggester } from './types.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

/**
 * OpenAI and OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, …) via Chat Completions,
 * which every compatible server implements.
 */
export class OpenAiNameSuggester implements NameSuggester {
  private readonly client: OpenAI;

  constructor(
    readonly provider: 'openai' | 'openai-compatible',
    private readonly model: string,
    apiKey: string | undefined,
    baseURL: string | undefined,
  ) {
    this.client = new OpenAI({
      // Local servers usually ignore the key, but the SDK requires one.
      apiKey: apiKey ?? (provider === 'openai-compatible' ? 'not-needed' : undefined),
      baseURL,
      timeout: NAMING_TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  async suggest(jpeg: Buffer): Promise<string | undefined> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: NAMING_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` },
            },
          ],
        },
      ],
    });
    const message = response.choices[0]?.message;
    if (!message || message.refusal) return undefined;
    return cleanSuggestion(message.content ?? '');
  }
}
