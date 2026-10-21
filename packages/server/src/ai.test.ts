import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test, vi } from 'vitest';
import { AiConnection, AI_RESPONSE_BYTES, AI_TIMEOUT_MS } from './ai.js';
import { detectionPrompt } from './detection.js';
import { namingPrompt, normalizeSuggestion } from './naming.js';
import { loadConfig, validateConfig } from './config.js';
import { createServer } from 'node:http';
import type { AiConfig } from './config.js';
import { buildApp } from './app.js';
import type { Job } from './protocol.js';
import defaults from '../../../config/default.json' with { type: 'json' };

const ai = {
  enabled: true,
  baseUrl: 'http://localhost:1234/v1/',
  model: 'vision',
  token: 'private-secret',
};
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function response(content: unknown = 'Zelda Moonlit Forest', extra = {}) {
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { content, ...extra } }],
  });
}
async function setup(config: AiConfig | undefined = ai) {
  // These tests isolate naming; detection has its own controlled integration suite.
  const namingFetch = globalThis.fetch;
  if (vi.isMockFunction(namingFetch))
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.messages?.[0]?.content === detectionPrompt)
        return Promise.resolve(response('{"subject":null}'));
      return namingFetch(url, init);
    });
  const root = await mkdtemp(join(tmpdir(), 'wallslice-ai-'));
  cleanups.push(() => rm(root, { force: true, recursive: true }));
  const app = buildApp({
    ...defaults,
    ...(config ? { ai: config } : { ai: { enabled: false } }),
    logLevel: 'silent',
    dataDirectory: join(root, 'data'),
    temporaryDirectory: join(root, 'tmp'),
  });
  cleanups.push(() => app.close());
  await app.ready();
  return app;
}
async function upload(app: Awaited<ReturnType<typeof buildApp>>) {
  const image = await sharp({
    create: { width: 1800, height: 600, channels: 3, background: '#123456' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'content-type': 'application/octet-stream' },
    payload: image,
  });
  expect(result.statusCode).toBe(200);
  return result.json<Job>();
}
test('environment-only configuration authenticates to a controlled provider and disabling AI prevents requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wallslice-env-ai-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const secret = 'environment-only-sentinel';
  let requests = 0;
  const provider = createServer((request, reply) => {
    requests++;
    expect(request.headers.authorization).toBe(`Bearer ${secret}`);
    expect(request.url).toBe('/v1/chat/completions');
    request.resume();
    reply.setHeader('content-type', 'application/json');
    reply.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'Moonlit Mountain Lake' },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, '127.0.0.1', resolve),
  );
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = provider.address() as { port: number };
  const environment = {
    SHIN_WALLSLICE_AI_ENABLED: 'true',
    SHIN_WALLSLICE_AI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    SHIN_WALLSLICE_AI_MODEL: 'vision',
    SHIN_WALLSLICE_AI_TOKEN: secret,
  };
  const config = await loadConfig(
    undefined,
    join(root, 'no-mount'),
    join(root, 'no-local'),
    environment,
  );
  const app = await setup(config.ai);
  const job = await upload(app);
  await vi.waitFor(async () =>
    expect((await app.inject(`/api/jobs/${job.id}/naming`)).json()).toEqual({
      state: 'succeeded',
      name: 'moonlit-mountain-lake',
    }),
  );
  expect(requests).toBe(2);
  for (const path of [
    '/api/health',
    '/api/catalog',
    `/api/jobs/${job.id}/naming`,
  ]) {
    const result = await app.inject(path);
    expect(result.body).not.toContain(secret);
    expect(result.body).not.toContain(config.ai!.baseUrl);
  }
  const disabled = await loadConfig(
    undefined,
    join(root, 'no-mount'),
    join(root, 'no-local'),
    { ...environment, SHIN_WALLSLICE_AI_ENABLED: 'false' },
  );
  expect((await upload(await setup(disabled.ai))).naming).toEqual({
    state: 'disabled',
  });
  expect(requests).toBe(2);
});
test('old configs remain valid; invalid AI settings and malformed JSON never disclose tokens', () => {
  const old: Partial<typeof defaults> = { ...defaults };
  delete old.ai;
  expect(validateConfig(old).ai).toBeUndefined();
  for (const value of [
    null,
    { enabled: 'yes' },
    { enabled: true },
    { ...ai, model: ' ' },
    { ...ai, baseUrl: 'file:///private-secret' },
    { ...ai, baseUrl: 'https://private-secret@example.com' },
    { ...ai, token: 'private-secret\n' },
    { ...ai, unknown: 'private-secret' },
  ]) {
    let message = '';
    try {
      validateConfig({ ...defaults, ai: value });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('ai');
    expect(message).not.toContain('private-secret');
  }
  expect(
    validateConfig({
      ...defaults,
      ai: { enabled: true, baseUrl: 'http://nas/v1', model: 'vision' },
    }).ai?.enabled,
  ).toBe(true);
});
test('prompt and representative naming fixtures support recognition without guessing and reject unusable responses', () => {
  for (const phrase of [
    'three meaningful words',
    'show or game title',
    'Do not guess',
    'image content',
    'no extension',
  ])
    expect(namingPrompt).toContain(phrase);
  for (const [input, expected] of [
    ['Zelda Moonlit Forest', 'zelda-moonlit-forest'],
    ['`Neon_City Lights`', 'neon-city-lights'],
    ['the-last-of-us-misty-forest', 'the-last-of-us-misty-forest'],
    ['静かな 山', '静かな-山'],
  ])
    expect(normalizeSuggestion(input!)).toBe(expected);
  for (const input of [
    '',
    '...',
    '../forest',
    'forest.png',
    'Name: moonlit forest',
    'Here is your name: forest',
    'I cannot identify this image',
    'Sorry',
    'forest\nextra',
    '```\nforest\n```',
  ])
    expect(() => normalizeSuggestion(input)).toThrow();
  expect(normalizeSuggestion('x'.repeat(150))).toHaveLength(100);
});
test('disabled AI and rejected uploads never contact a service', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const app = await setup({ enabled: false });
  expect((await upload(app)).naming).toEqual({ state: 'disabled' });
  const enabled = await setup();
  expect(
    (
      await enabled.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: { 'content-type': 'application/octet-stream' },
        payload: Buffer.from('invalid'),
      })
    ).statusCode,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
test('accepted upload automatically sends oriented bounded source with configured model/auth; result survives render settings and duplicate retry', async () => {
  let finish!: (r: Response) => void;
  const fetch = vi.fn(
    (...args: [string, RequestInit]) =>
      new Promise<Response>((resolve) => {
        expect(args).toHaveLength(2);
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const app = await setup();
  const job = await upload(app);
  expect(job.naming).toEqual({ state: 'pending' });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe('http://localhost:1234/v1/chat/completions');
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer private-secret',
  });
  const body = JSON.parse(init.body as string);
  expect(body.model).toBe('vision');
  expect(body.messages[0].content).toBe(namingPrompt);
  const image = Buffer.from(
    body.messages[1].content[0].image_url.url.split(',')[1],
    'base64',
  );
  expect(await sharp(image).metadata()).toMatchObject({
    width: 341,
    height: 1024,
    format: 'jpeg',
  });
  expect(image.length).toBeLessThan(2 * 1024 * 1024);
  const catalog = await app.inject('/api/catalog');
  expect(catalog.body).not.toContain('private-secret');
  expect(catalog.body).not.toContain('baseUrl');
  await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/naming` });
  expect(fetch).toHaveBeenCalledTimes(1);
  finish(response());
  await vi.waitFor(async () =>
    expect((await app.inject(`/api/jobs/${job.id}/naming`)).json()).toEqual({
      state: 'succeeded',
      name: 'zelda-moonlit-forest',
    }),
  );
  await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/naming` });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([401, 429, 400, 500])(
  'upstream %s fails safely and explicit retry deduplicates requests',
  async (status) => {
    let finish!: (r: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('private-secret provider details', { status }),
      )
      .mockImplementation(
        () =>
          new Promise<Response>((r) => {
            finish = r;
          }),
      );
    vi.stubGlobal('fetch', fetch);
    const app = await setup();
    const job = await upload(app);
    await vi.waitFor(async () =>
      expect(
        (await app.inject(`/api/jobs/${job.id}/naming`)).json().state,
      ).toBe('failed'),
    );
    const failure = await app.inject(`/api/jobs/${job.id}/naming`);
    expect(failure.body).not.toContain('private-secret');
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/naming` });
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/naming` });
    expect(fetch).toHaveBeenCalledTimes(2);
    finish(response('silent-mountain-lake'));
    await vi.waitFor(async () =>
      expect((await app.inject(`/api/jobs/${job.id}/naming`)).json().name).toBe(
        'silent-mountain-lake',
      ),
    );
  },
);
test('discard aborts outstanding requests and a later image has independent state', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) =>
        init.signal!.addEventListener('abort', () =>
          reject(new Error('cancelled')),
        ),
      );
    }),
  );
  const app = await setup();
  const old = await upload(app);
  await app.inject({ method: 'DELETE', url: `/api/jobs/${old.id}` });
  expect(signals[0]!.aborted).toBe(true);
  expect((await app.inject(`/api/jobs/${old.id}/naming`)).statusCode).toBe(404);
  const next = await upload(app);
  expect(next.id).not.toBe(old.id);
  expect(next.naming?.state).toBe('pending');
});
test('transport has finite timeout, response-size limits, safe connection/invalid response failure and optional auth', async () => {
  const connection = new AiConnection({
    enabled: true,
    baseUrl: 'http://nas/v1',
    model: 'vision',
  });
  for (const result of [
    response(null),
    response('name', { refusal: 'private-secret' }),
    new Response('x'.repeat(AI_RESPONSE_BYTES + 1)),
    new Response('{bad'),
  ]) {
    const fetch = vi.fn().mockResolvedValue(result);
    vi.stubGlobal('fetch', fetch);
    await expect(
      connection.complete([], new AbortController().signal),
    ).rejects.toThrow('AI request failed');
    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('private-secret')),
  );
  await expect(
    connection.complete([], new AbortController().signal),
  ).rejects.toThrow('AI request failed');
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new Error('private-secret')),
          ),
        ),
    ),
  );
  const pending = expect(
    connection.complete([], new AbortController().signal),
  ).rejects.toThrow('AI request failed');
  await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
  await pending;
});
