import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface AiConfig {
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  token?: string;
}

export interface RuntimeConfig {
  ai?: AiConfig;
  dataDirectory: string;
  temporaryDirectory: string;
  memoryBudgetMiB: number;
  temporaryStorageMiB: number;
  jobTtlMinutes: number;
  maxJobs: number;
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}
const defaults = fileURLToPath(
  new URL('../../../config/default.json', import.meta.url),
);
const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

export function validateConfig(value: unknown): RuntimeConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected a JSON object');
  const config = value as Record<string, unknown>;
  const unknown = Object.keys(config).filter(
    (key) =>
      ![
        'ai',
        'host',
        'port',
        'logLevel',
        'dataDirectory',
        'temporaryDirectory',
        'memoryBudgetMiB',
        'temporaryStorageMiB',
        'jobTtlMinutes',
        'maxJobs',
      ].includes(key),
  );
  if (unknown.length)
    throw new Error(`unknown setting(s): ${unknown.join(', ')}`);
  if (typeof config.host !== 'string' || config.host.trim().length === 0)
    throw new Error('host must be a nonempty string');
  if (
    typeof config.port !== 'number' ||
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  )
    throw new Error('port must be an integer between 1 and 65535');
  if (typeof config.logLevel !== 'string' || !levels.includes(config.logLevel))
    throw new Error(`logLevel must be one of: ${levels.join(', ')}`);
  for (const key of ['dataDirectory', 'temporaryDirectory']) {
    if (typeof config[key] !== 'string' || !(config[key] as string).trim())
      throw new Error(`${key} must be a nonempty path`);
  }
  for (const [key, min, max] of [
    ['memoryBudgetMiB', 1024, 3072],
    ['temporaryStorageMiB', 1024, 65536],
    ['jobTtlMinutes', 1, 1440],
    ['maxJobs', 1, 16],
  ] as const) {
    const value = config[key];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  if (config.ai !== undefined) {
    const ai = config.ai as Record<string, unknown> | null;
    if (
      !ai ||
      typeof ai !== 'object' ||
      Array.isArray(ai) ||
      Object.keys(ai).some(
        (key) => !['enabled', 'baseUrl', 'model', 'token'].includes(key),
      ) ||
      typeof ai.enabled !== 'boolean'
    )
      throw new Error(
        'ai must contain enabled (boolean) and only baseUrl, model, token settings',
      );
    if (
      ai.token !== undefined &&
      (typeof ai.token !== 'string' || /[\r\n]/.test(ai.token))
    )
      throw new Error('ai.token must be a string without line breaks');
    if (
      ai.model !== undefined &&
      (typeof ai.model !== 'string' || !ai.model.trim())
    )
      throw new Error('ai.model must be a nonempty string');
    if (ai.baseUrl !== undefined) {
      try {
        if (typeof ai.baseUrl !== 'string' || ai.baseUrl !== ai.baseUrl.trim())
          throw new Error();
        const url = new URL(ai.baseUrl);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error();
      } catch {
        throw new Error(
          'ai.baseUrl must be an HTTP(S) API base URL without credentials, query, or fragment',
        );
      }
    }
    if (ai.enabled && (!ai.baseUrl || !ai.model))
      throw new Error('enabled ai requires ai.baseUrl and a nonempty ai.model');
  }
  return config as unknown as RuntimeConfig;
}

export async function loadConfig(
  explicitPath?: string,
  mountedPath = '/config/config.json',
): Promise<RuntimeConfig> {
  let path = explicitPath ?? mountedPath;
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (!explicitPath && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      path = defaults;
      raw = await readFile(path, 'utf8');
    } else {
      throw new Error(
        `Configuration error in ${path}: ${(error as Error).message}`,
      );
    }
  }
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('invalid JSON');
    }
    return validateConfig(parsed);
  } catch (error) {
    throw new Error(
      `Configuration error in ${path}: ${(error as Error).message}`,
    );
  }
}
