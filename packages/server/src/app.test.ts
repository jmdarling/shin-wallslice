import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig, validateConfig } from './config.js';

import defaults from '../../../config/default.json' with { type: 'json' };
const config = {
  ...defaults,
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
} as const;
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'wallslice-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('health endpoint reports the running server', async () => {
  const runtime = {
    ...config,
    temporaryDirectory: await temporaryDirectory(),
    dataDirectory: await temporaryDirectory(),
  };
  const app = buildApp(runtime);
  cleanup.push(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });
});

test('Fastify serves HTML and assets on the API listener', async () => {
  const root = await temporaryDirectory();
  await writeFile(
    join(root, 'index.html'),
    '<shin-app></shin-app><script src="/app.js"></script>',
  );
  await writeFile(join(root, 'app.js'), 'console.log("shin-wallslice")');
  const runtime = {
    ...config,
    temporaryDirectory: await temporaryDirectory(),
    dataDirectory: await temporaryDirectory(),
  };
  const app = buildApp(runtime, root);
  cleanup.push(() => app.close());
  const html = await app.inject('/');
  expect(html.statusCode).toBe(200);
  expect(html.headers['content-type']).toContain('text/html');
  expect(html.body).toContain('<shin-app>');
  const asset = await app.inject('/app.js');
  expect(asset.statusCode).toBe(200);
  expect(asset.headers['content-type']).toContain('javascript');
  expect((await app.inject('/api/missing')).statusCode).toBe(404);
});

test('missing mount uses the bundled JSON defaults', async () => {
  const root = await temporaryDirectory();
  expect(await loadConfig(undefined, join(root, 'missing.json'))).toEqual(
    JSON.parse(
      await readFile(
        new URL('../../../config/default.json', import.meta.url),
        'utf8',
      ),
    ),
  );
});

test('a replacement config is used in full, including the port', async () => {
  const path = join(await temporaryDirectory(), 'config.json');
  const replacement = { ...config, port: 3456 };
  await writeFile(path, JSON.stringify(replacement));
  expect(await loadConfig(undefined, path)).toEqual(replacement);
  expect(await loadConfig(path)).toEqual(replacement);
  await writeFile(path, JSON.stringify({ port: 3456 }));
  await expect(loadConfig(path)).rejects.toThrow('host');
});

test('malformed configuration and unreadable explicit files have clear diagnostics', async () => {
  const path = join(await temporaryDirectory(), 'config.json');
  await writeFile(path, '{broken');
  await expect(loadConfig(path)).rejects.toThrow(
    `Configuration error in ${path}`,
  );
  await expect(loadConfig(`${path}.missing`)).rejects.toThrow(
    'Configuration error',
  );
});

test.each([
  [null, 'JSON object'],
  [{ ...config, port: 0 }, 'port'],
  [{ ...config, port: 65536 }, 'port'],
  [{ ...config, port: 1.5 }, 'port'],
  [{ ...config, host: '' }, 'host'],
  [{ ...config, logLevel: 'noisy' }, 'logLevel'],
  [{ ...config, extra: true }, 'unknown setting'],
  [{ ...config, memoryBudgetMiB: 512 }, 'memoryBudgetMiB'],
  [{ ...config, temporaryStorageMiB: -1 }, 'temporaryStorageMiB'],
  [{ ...config, jobTtlMinutes: 0 }, 'jobTtlMinutes'],
  [{ ...config, maxJobs: 1.5 }, 'maxJobs'],
  [{ ...config, dataDirectory: '' }, 'dataDirectory'],
  [{ ...config, temporaryDirectory: null }, 'temporaryDirectory'],
])('rejects invalid configuration %j', (value, message) => {
  expect(() => validateConfig(value)).toThrow(message);
});
