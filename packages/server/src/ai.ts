import type { AiConfig } from './config.js';

// Transport is independent of any prompt or task. Never surface upstream bodies/errors.
export const AI_TIMEOUT_MS = 30_000;
export const AI_RESPONSE_BYTES = 64 * 1024;
export class AiConnection {
  constructor(private readonly config: AiConfig) {}

  async complete(messages: unknown[], signal: AbortSignal): Promise<string> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timer = setTimeout(abort, AI_TIMEOUT_MS);
    let response: Response | undefined;
    try {
      response = await fetch(
        `${this.config.baseUrl!.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.token
              ? { Authorization: `Bearer ${this.config.token}` }
              : {}),
          },
          body: JSON.stringify({ model: this.config.model, messages }),
        },
      );
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > AI_RESPONSE_BYTES) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        choices?: {
          finish_reason?: string;
          message?: { content?: unknown; refusal?: unknown };
        }[];
      };
      const choice = data.choices?.[0];
      if (
        choice?.finish_reason !== 'stop' ||
        choice.message?.refusal ||
        typeof choice.message?.content !== 'string'
      )
        throw new Error();
      return choice.message.content;
    } catch {
      throw new Error(
        'AI request failed. Check the configured service, credentials, and model.',
      );
    } finally {
      controller.abort();
      await response?.body?.cancel().catch(() => {});
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
