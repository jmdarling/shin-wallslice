import {
  mkdtemp,
  writeFile,
  rm,
  mkdir,
  copyFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { loadConfig, environmentSettings } from './config.js';
import defaults from '../../../config/default.json' with { type: 'json' };
import dockerDefaults from '../../../config/docker.json' with { type: 'json' };

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wallslice-config-'));
  roots.push(root);
  const mounted = join(root, 'mounted.json');
  const local = join(root, 'local.json');
  const explicit = join(root, 'explicit.json');
  const put = (path: string, value: unknown) =>
    writeFile(path, JSON.stringify(value));
  const load = (env: NodeJS.ProcessEnv = {}, path?: string) =>
    loadConfig(path, mounted, local, env);
  return { root, mounted, local, explicit, put, load };
}

test('local and Docker defaults survive absent files and unrelated environment', async () => {
  const f = await fixture();
  expect(await f.load({ PORT: '123', OPENAI_API_KEY: 'unused' })).toEqual(
    defaults,
  );
  const bundled = join(f.root, 'docker.json');
  await f.put(bundled, dockerDefaults);
  expect(await loadConfig(undefined, f.mounted, f.local, {}, bundled)).toEqual(
    dockerDefaults,
  );
});

test('selects exactly one file in explicit, mount, local order; missing automatic files fall back', async () => {
  const f = await fixture();
  await f.put(f.local, { port: 3001, ai: { token: 'local-token' } });
  expect(await f.load()).toEqual({
    ...defaults,
    port: 3001,
    ai: { enabled: false, token: 'local-token' },
  });
  await f.put(f.mounted, { port: 3002 });
  expect(await f.load()).toEqual({ ...defaults, port: 3002 });
  await f.put(f.explicit, { port: 3003 });
  expect((await f.load({}, f.explicit)).port).toBe(3003);
  await expect(f.load({}, `${f.explicit}.missing`)).rejects.toThrow(
    'cannot read file',
  );
  await writeFile(f.local, '{bad');
  expect((await f.load()).port).toBe(3002);
  await writeFile(f.mounted, '{bad');
  await expect(f.load()).rejects.toThrow('invalid JSON');
  await rm(f.mounted);
  await expect(f.load()).rejects.toThrow('invalid JSON');
  await expect(loadConfig(undefined, f.root, f.local, {})).rejects.toThrow(
    'cannot read file',
  );
});

test('nested merging preserves siblings and supports complete legacy files', async () => {
  const f = await fixture();
  await f.put(f.local, {
    ai: {
      enabled: true,
      model: 'vision',
      baseUrl: 'http://provider/v1',
      token: 'json-secret',
    },
  });
  expect((await f.load({ SHIN_WALLSLICE_AI_TOKEN: 'env-secret' })).ai).toEqual({
    enabled: true,
    model: 'vision',
    baseUrl: 'http://provider/v1',
    token: 'env-secret',
  });
  expect(
    (
      await f.load({
        SHIN_WALLSLICE_AI_ENABLED: 'false',
        SHIN_WALLSLICE_AI_TOKEN: '',
      })
    ).ai,
  ).toMatchObject({ enabled: false, token: '' });
  const old: Partial<typeof defaults> = { ...defaults };
  delete old.ai;
  await f.put(f.local, old);
  expect(await f.load()).toEqual(defaults);
});

test('every environment setting overrides JSON and environment-only AI is supported', async () => {
  const f = await fixture();
  const values = {
    oledMinimumDarkPercentage: 23.5,
    oledNearBlackCutoff: 40,
    oledMaxVisionRequests: 3,
    host: '127.0.0.1',
    port: 3456,
    logLevel: 'warn',
    dataDirectory: './private-data',
    temporaryDirectory: './private-tmp',
    outputDirectory: './output',
    memoryBudgetMiB: 1024,
    temporaryStorageMiB: 8192,
    jobTtlMinutes: 10,
    maxJobs: 2,
    ai: {
      enabled: true,
      baseUrl: 'http://provider/v1',
      model: 'vision',
      token: 'sentinel-secret',
    },
  } as const;
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, suffix] of Object.entries(environmentSettings)) {
    const value = key.startsWith('ai.')
      ? values.ai[key.slice(3) as keyof typeof values.ai]
      : values[key as keyof Omit<typeof values, 'ai'>];
    environment[`SHIN_WALLSLICE_${suffix}`] = String(value);
  }
  expect(await f.load(environment)).toEqual(values);
  await f.put(f.local, defaults);
  expect(await f.load(environment)).toEqual(values);
});

test.each([
  '',
  ' 1',
  '1 ',
  '+1',
  '-1',
  '01',
  '1.0',
  '1e3',
  '0x10',
  'Infinity',
  'NaN',
  '9007199254740993',
])('rejects strict numeric input %j', async (value) => {
  const f = await fixture();
  await expect(f.load({ SHIN_WALLSLICE_PORT: value })).rejects.toThrow(
    'Configuration error',
  );
});
test.each(['', 'TRUE', '1', '0', ' true', 'false '])(
  'rejects strict boolean input %j',
  async (value) => {
    const f = await fixture();
    await expect(f.load({ SHIN_WALLSLICE_AI_ENABLED: value })).rejects.toThrow(
      'AI_ENABLED',
    );
  },
);
test('validates supplied values before overrides and checks effective AI requirements', async () => {
  const f = await fixture();
  for (const value of [
    { port: 0 },
    { ai: { token: 123 } },
    { ai: { enabled: null } },
    { ai: { model: '' } },
    { ai: { baseUrl: 'bad' } },
    { ai: null },
    { unknown: true },
    { ai: { unknown: true } },
    null,
    [],
  ]) {
    await f.put(f.local, value);
    await expect(
      f.load({
        SHIN_WALLSLICE_PORT: '3456',
        SHIN_WALLSLICE_AI_TOKEN: 'valid',
        SHIN_WALLSLICE_AI_ENABLED: 'false',
        SHIN_WALLSLICE_AI_MODEL: 'valid',
        SHIN_WALLSLICE_AI_BASE_URL: 'http://valid',
      }),
    ).rejects.toThrow('Configuration error');
  }
  await f.put(f.local, {});
  await expect(f.load({ SHIN_WALLSLICE_AI_ENABLED: 'true' })).rejects.toThrow(
    'enabled ai requires',
  );
  for (const suffix of [
    'HOST',
    'LOG_LEVEL',
    'DATA_DIRECTORY',
    'TEMPORARY_DIRECTORY',
  ]) {
    await expect(f.load({ [`SHIN_WALLSLICE_${suffix}`]: '' })).rejects.toThrow(
      'Configuration error',
    );
  }
});

test('blank Unraid AI fields are unset while enabled AI still requires an endpoint and model', async () => {
  const f = await fixture();
  const emptyFields = {
    SHIN_WALLSLICE_AI_BASE_URL: '',
    SHIN_WALLSLICE_AI_MODEL: '',
    SHIN_WALLSLICE_AI_TOKEN: '',
  };
  expect((await f.load(emptyFields)).ai).toEqual({ enabled: false, token: '' });
  await expect(
    f.load({ ...emptyFields, SHIN_WALLSLICE_AI_ENABLED: 'true' }),
  ).rejects.toThrow('enabled ai requires');
  await f.put(f.local, {
    ai: { enabled: true, baseUrl: 'http://provider/v1', model: 'vision' },
  });
  expect((await f.load(emptyFields)).ai).toEqual({
    enabled: true,
    baseUrl: 'http://provider/v1',
    model: 'vision',
    token: '',
  });
  for (const suffix of ['AI_BASE_URL', 'AI_MODEL']) {
    await expect(f.load({ [`SHIN_WALLSLICE_${suffix}`]: ' ' })).rejects.toThrow(
      'Configuration error',
    );
  }
});

test('malformed JSON, unknown keys and invalid environment diagnostics never echo sentinel secrets', async () => {
  const f = await fixture();
  const secret = 'sentinel-credential-never-print';
  for (const text of [
    `{"ai":{"token":"${secret}"}, BROKEN`,
    JSON.stringify({ [secret]: true, ai: { token: secret } }),
    JSON.stringify({ ai: { token: `${secret}\n` } }),
  ]) {
    await writeFile(f.local, text);
    const error = await f.load().catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(secret);
  }
  await f.put(f.local, {});
  for (const suffix of Object.values(environmentSettings)) {
    if (
      [
        'HOST',
        'DATA_DIRECTORY',
        'TEMPORARY_DIRECTORY',
        'OUTPUT_DIRECTORY',
        'AI_TOKEN',
        'AI_MODEL',
      ].includes(suffix)
    )
      continue;
    const error = await f
      .load({
        [`SHIN_WALLSLICE_${suffix}`]: secret,
        SHIN_WALLSLICE_AI_TOKEN: secret,
      })
      .catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(secret);
  }
});

test('partial AI JSON preserves bundled siblings and invalid environment tokens fail safely', async () => {
  const f = await fixture();
  const bundled = join(f.root, 'defaults.json');
  const ai = {
    enabled: true,
    baseUrl: 'http://provider/v1',
    model: 'vision',
    token: 'old',
  };
  await f.put(bundled, { ...defaults, ai });
  await f.put(f.local, { ai: { token: 'new' } });
  expect(
    (await loadConfig(undefined, f.mounted, f.local, {}, bundled)).ai,
  ).toEqual({ ...ai, token: 'new' });
  const error = await f
    .load({ SHIN_WALLSLICE_AI_TOKEN: 'secret-sentinel\n' })
    .catch((error: Error) => error);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toContain('ai.token');
  expect(String(error)).not.toContain('secret-sentinel');
});

test('automatic local discovery is anchored to the repository from root and package working directories', async () => {
  const f = await fixture();
  const source = join(f.root, 'packages/server/src');
  const config = join(f.root, 'config');
  await mkdir(source, { recursive: true });
  await mkdir(config);
  // Reproduce the source and compiled module layout without touching private local files.
  await copyFile(
    new URL('./config.ts', import.meta.url),
    join(source, 'config.ts'),
  );
  await f.put(join(config, 'default.json'), defaults);
  await f.put(join(config, 'local.json'), {
    port: 3456,
    ai: { token: 'discovery-sentinel' },
  });
  const url = pathToFileURL(join(source, 'config.ts')).href;
  const script = `const { loadConfig } = await import(${JSON.stringify(url)}); const config = await loadConfig(undefined, ${JSON.stringify(f.mounted)}); console.log(JSON.stringify(config));`;
  for (const cwd of [f.root, join(f.root, 'packages/server')]) {
    const result = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd, encoding: 'utf8', env: {} },
    );
    expect(JSON.parse(result)).toEqual({
      ...defaults,
      port: 3456,
      ai: { enabled: false, token: 'discovery-sentinel' },
    });
  }
});

test('output directory uses normal JSON/environment precedence and rejects invalid supplied values safely', async () => {
  const f = await fixture();
  await f.put(f.local, { outputDirectory: './wallpapers' });
  expect((await f.load()).outputDirectory).toBe('./wallpapers');
  expect(
    (await f.load({ SHIN_WALLSLICE_OUTPUT_DIRECTORY: '/data/output' }))
      .outputDirectory,
  ).toBe('/data/output');
  for (const outputDirectory of ['', ' ', 1, null, 'path\u0000secret']) {
    await f.put(f.local, { outputDirectory });
    await expect(
      f.load({ SHIN_WALLSLICE_OUTPUT_DIRECTORY: '/valid' }),
    ).rejects.toThrow('outputDirectory');
  }
});

test('output configuration is read-only and relative paths stay relative to the process', async () => {
  const f = await fixture();
  await f.put(f.local, { outputDirectory: './output' });
  await chmod(f.local, 0o444);
  expect((await f.load()).outputDirectory).toBe('./output');
  expect(
    await import('node:fs/promises').then((fs) => fs.readFile(f.local, 'utf8')),
  ).toBe(JSON.stringify({ outputDirectory: './output' }));
});

test('OLED settings support partial read-only JSON, decimal percent units and strict environment bounds', async () => {
  const f = await fixture();
  await f.put(f.local, { oledMinimumDarkPercentage: 20.5 });
  await chmod(f.local, 0o444);
  expect(
    await f.load({
      SHIN_WALLSLICE_OLED_NEAR_BLACK_CUTOFF: '0',
      SHIN_WALLSLICE_OLED_MAX_VISION_REQUESTS: '1',
    }),
  ).toMatchObject({
    oledMinimumDarkPercentage: 20.5,
    oledNearBlackCutoff: 0,
    oledMaxVisionRequests: 1,
  });
  await chmod(f.local, 0o644);
  for (const value of [
    { oledMinimumDarkPercentage: -1 },
    { oledMinimumDarkPercentage: 101 },
    { oledNearBlackCutoff: 1.5 },
    { oledNearBlackCutoff: 256 },
    { oledMaxVisionRequests: 0 },
    { oledMaxVisionRequests: 9 },
  ]) {
    await f.put(f.local, value);
    await expect(f.load()).rejects.toThrow('Configuration error');
  }
  await f.put(f.local, {});
  for (const raw of ['NaN', 'Infinity', '-1', '100.1', ' 20'])
    await expect(
      f.load({ SHIN_WALLSLICE_OLED_MINIMUM_DARK_PERCENTAGE: raw }),
    ).rejects.toThrow();
});
