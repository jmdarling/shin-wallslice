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
  outputDirectory?: string;
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
        'outputDirectory',
        'memoryBudgetMiB',
        'temporaryStorageMiB',
        'jobTtlMinutes',
        'maxJobs',
      ].includes(key),
  );
  if (unknown.length) throw new Error('unknown setting(s) in JSON');
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
  if (
    config.outputDirectory !== undefined &&
    (typeof config.outputDirectory !== 'string' ||
      !config.outputDirectory.trim() ||
      [...config.outputDirectory].some(
        (character) => character.charCodeAt(0) < 32,
      ))
  )
    throw new Error(
      'outputDirectory must be a nonempty path without control characters',
    );
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

export const environmentSettings = {
  host: 'HOST',
  port: 'PORT',
  logLevel: 'LOG_LEVEL',
  dataDirectory: 'DATA_DIRECTORY',
  temporaryDirectory: 'TEMPORARY_DIRECTORY',
  outputDirectory: 'OUTPUT_DIRECTORY',
  memoryBudgetMiB: 'MEMORY_BUDGET_MIB',
  temporaryStorageMiB: 'TEMPORARY_STORAGE_MIB',
  jobTtlMinutes: 'JOB_TTL_MINUTES',
  maxJobs: 'MAX_JOBS',
  'ai.enabled': 'AI_ENABLED',
  'ai.baseUrl': 'AI_BASE_URL',
  'ai.model': 'AI_MODEL',
  'ai.token': 'AI_TOKEN',
} as const;
const local = fileURLToPath(
  new URL('../../../config/local.json', import.meta.url),
);

function merge(base: RuntimeConfig, override: Record<string, unknown>) {
  return {
    ...base,
    ...override,
    ...(override.ai !== undefined
      ? { ai: { ...base.ai, ...(override.ai as object) } }
      : {}),
  };
}

// Check supplied fields before merging later sources. AI's cross-field requirements
// are checked on the effective configuration, allowing environment-only setup.
function validateOverride(base: RuntimeConfig, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('expected a JSON object');
  const override = value as Record<string, unknown>;
  if ('ai' in override) {
    if (
      !override.ai ||
      typeof override.ai !== 'object' ||
      Array.isArray(override.ai)
    )
      throw new Error('ai must be a JSON object');
    const ai = override.ai as Record<string, unknown>;
    if ('enabled' in ai && typeof ai.enabled !== 'boolean')
      throw new Error('ai.enabled must be a boolean');
  }
  const candidate = merge(base, override);
  validateConfig({ ...candidate, ai: { ...candidate.ai, enabled: false } });
  return candidate as RuntimeConfig;
}

async function readConfiguration(path: string, optional: boolean) {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
    // Do not print filesystem error text, which can include supplied contents.
    throw new Error(`Configuration error in ${path}: cannot read file`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Configuration error in ${path}: invalid JSON`);
  }
}

export async function loadConfig(
  explicitPath?: string,
  mountedPath = '/config/config.json',
  localPath = local,
  environment: NodeJS.ProcessEnv = process.env,
  defaultsPath = defaults,
): Promise<RuntimeConfig> {
  try {
    let config = validateConfig(await readConfiguration(defaultsPath, false));
    for (const path of explicitPath !== undefined
      ? [explicitPath]
      : [mountedPath, localPath]) {
      const override = await readConfiguration(
        path,
        explicitPath === undefined,
      );
      if (override === undefined) continue;
      config = validateOverride(config, override);
      break;
    }
    for (const [setting, suffix] of Object.entries(environmentSettings)) {
      const name = `SHIN_WALLSLICE_${suffix}`;
      const raw = environment[name];
      if (raw === undefined) continue;
      // Unraid supplies blank optional template fields as empty environment values.
      // Preserve JSON/default endpoint settings until these fields are filled in.
      if (raw === '' && ['ai.baseUrl', 'ai.model'].includes(setting)) continue;
      let value: string | number | boolean = raw;
      if (setting === 'ai.enabled') {
        if (raw !== 'true' && raw !== 'false')
          throw new Error(`${name} must be true or false`);
        value = raw === 'true';
      } else if (
        [
          'port',
          'memoryBudgetMiB',
          'temporaryStorageMiB',
          'jobTtlMinutes',
          'maxJobs',
        ].includes(setting)
      ) {
        if (!/^(0|[1-9][0-9]*)$/.test(raw))
          throw new Error(
            `${name} must be an unsigned decimal integer without whitespace or leading zeros`,
          );
        value = Number(raw);
      }
      const field = setting.startsWith('ai.')
        ? { ai: { [setting.slice(3)]: value } }
        : { [setting]: value };
      config = validateOverride(config, field);
    }
    return validateConfig(config);
  } catch (error) {
    throw new Error(`Configuration error: ${(error as Error).message}`);
  }
}
