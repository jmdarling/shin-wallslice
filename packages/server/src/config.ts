import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface RuntimeConfig {
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
    (key) => !['host', 'port', 'logLevel'].includes(key),
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
    return validateConfig(JSON.parse(raw) as unknown);
  } catch (error) {
    throw new Error(
      `Configuration error in ${path}: ${(error as Error).message}`,
    );
  }
}
