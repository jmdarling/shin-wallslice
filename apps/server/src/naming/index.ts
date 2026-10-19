import type { NamingConfig } from '../config.js';
import { AnthropicNameSuggester, DEFAULT_ANTHROPIC_MODEL } from './anthropic.js';
import { DEFAULT_OPENAI_MODEL, OpenAiNameSuggester } from './openai.js';
import type { NameSuggester } from './types.js';

export type { NameSuggester } from './types.js';

/** Build the configured name suggester, or undefined when AI naming is disabled. */
export function createNameSuggester(config: NamingConfig | undefined): NameSuggester | undefined {
  if (!config) return undefined;
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicNameSuggester(config.model ?? DEFAULT_ANTHROPIC_MODEL, config.apiKey, config.baseUrl);
    case 'openai':
      return new OpenAiNameSuggester('openai', config.model ?? DEFAULT_OPENAI_MODEL, config.apiKey, config.baseUrl);
    case 'openai-compatible':
      // config.ts guarantees model and baseUrl for this provider.
      return new OpenAiNameSuggester('openai-compatible', config.model!, config.apiKey, config.baseUrl);
  }
}
