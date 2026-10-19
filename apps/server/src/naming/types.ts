/** Suggests a short descriptive name for an image. Implementations wrap one vendor each. */
export interface NameSuggester {
  readonly provider: string;
  /** Returns a short phrase (not yet slugified), or undefined if the model declined. */
  suggest(jpeg: Buffer): Promise<string | undefined>;
}

export const NAMING_TIMEOUT_MS = 15_000;

export const NAMING_PROMPT =
  'Suggest a short file name for this wallpaper image. Use about 3 words, at most 8. ' +
  'Name the main subject. If it shows a recognizable character, franchise, game, film or place, ' +
  'include that name. Reply with the name only: no quotes, punctuation or file extension.';

/** Strip quotes, trailing punctuation and extra lines from a model reply. */
export function cleanSuggestion(text: string): string | undefined {
  const firstLine = text.trim().split('\n')[0] ?? '';
  const cleaned = firstLine.replace(/^["'`]+|["'`.!]+$/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : undefined;
}
