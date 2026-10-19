import Anthropic from '@anthropic-ai/sdk';
import { cleanSuggestion, NAMING_PROMPT, NAMING_TIMEOUT_MS, type NameSuggester } from './types.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Models that accept the server-side refusal fallback in its `"default"` form. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
/** Models that accept `output_config.effort`; captioning needs very little thinking. */
const EFFORT_MODELS = new Set([...FALLBACK_MODELS, 'claude-haiku-5-5']);

export class AnthropicNameSuggester implements NameSuggester {
  readonly provider = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    private readonly model: string = DEFAULT_ANTHROPIC_MODEL,
    apiKey?: string,
    baseURL?: string,
  ) {
    this.client = new Anthropic({ apiKey, baseURL, timeout: NAMING_TIMEOUT_MS, maxRetries: 1 });
  }

  async suggest(jpeg: Buffer): Promise<string | undefined> {
    const useFallbacks = FALLBACK_MODELS.has(this.model);
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 1024,
      ...(EFFORT_MODELS.has(this.model) ? { output_config: { effort: 'low' as const } } : {}),
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') },
            },
            { type: 'text', text: NAMING_PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return undefined;
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return cleanSuggestion(text);
  }
}
