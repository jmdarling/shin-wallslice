import { fileURLToPath } from 'node:url';

export type NamingProviderName = 'anthropic' | 'openai' | 'openai-compatible';

export interface NamingConfig {
  provider: NamingProviderName;
  model: string | undefined;
  baseUrl: string | undefined;
  apiKey: string | undefined;
}

export interface Config {
  isProduction: boolean;
  host: string;
  port: number;
  logLevel: string;
  dataDir: string;
  outputDir: string;
  modelsDir: string;
  devicesDir: string;
  webDistDir: string;
  maxUploadBytes: number;
  maxUploadMb: number;
  maxInputMegapixels: number;
  tempTtlMs: number;
  urlFetchAllowPrivate: boolean;
  workConcurrency: number;
  naming: NamingConfig | undefined;
}

/** Repository root, resolved from this file (works from both src/ and dist/). */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min = 1): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min} (got "${raw}")`);
  }
  return value;
}

function boolEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean (got "${env[name]}")`);
}

function namingConfig(env: NodeJS.ProcessEnv): NamingConfig | undefined {
  const provider = env.NAMING_PROVIDER?.trim();
  if (!provider) return undefined;
  if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'openai-compatible') {
    throw new Error(
      `NAMING_PROVIDER must be anthropic, openai or openai-compatible (got "${provider}")`,
    );
  }
  const model = env.NAMING_MODEL?.trim() || undefined;
  const baseUrl = env.NAMING_BASE_URL?.trim() || undefined;
  const apiKey =
    env.NAMING_API_KEY?.trim() ||
    (provider === 'anthropic' ? env.ANTHROPIC_API_KEY?.trim() : env.OPENAI_API_KEY?.trim()) ||
    undefined;

  if (provider === 'openai-compatible') {
    if (!baseUrl)
      throw new Error('NAMING_BASE_URL is required when NAMING_PROVIDER=openai-compatible');
    if (!model) throw new Error('NAMING_MODEL is required when NAMING_PROVIDER=openai-compatible');
  }
  return { provider, model, baseUrl, apiKey };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const maxUploadMb = intEnv(env, 'MAX_UPLOAD_MB', 100);
  return {
    isProduction,
    host: env.HOST?.trim() || '0.0.0.0',
    port: intEnv(env, 'PORT', 3000),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    dataDir: env.DATA_DIR?.trim() || (isProduction ? '/data' : `${repoRoot}.data`),
    outputDir: env.OUTPUT_DIR?.trim() || (isProduction ? '/output' : `${repoRoot}.output`),
    modelsDir: env.MODELS_DIR?.trim() || `${repoRoot}models`,
    devicesDir: env.DEVICES_DIR?.trim() || `${repoRoot}devices`,
    webDistDir: env.WEB_DIST_DIR?.trim() || `${repoRoot}apps/web/dist`,
    maxUploadMb,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    maxInputMegapixels: intEnv(env, 'MAX_INPUT_MEGAPIXELS', 50),
    tempTtlMs: intEnv(env, 'TEMP_TTL_HOURS', 24) * 60 * 60 * 1000,
    urlFetchAllowPrivate: boolEnv(env, 'URL_FETCH_ALLOW_PRIVATE', true),
    workConcurrency: intEnv(env, 'WORK_CONCURRENCY', 2),
    naming: namingConfig(env),
  };
}
