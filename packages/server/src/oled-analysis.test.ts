import * as analysis from './oled-analysis.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test, vi } from 'vitest';
import {
  classifySource,
  prepareComparison,
  searchCutoff,
  oledPrompt,
} from './oled-analysis.js';
import { AiConnection } from './ai.js';
import { buildApp } from './app.js';
import defaults from '../../../config/default.json' with { type: 'json' };
import type { Job, OledAnalysis } from './protocol.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(pixels: number[][]) {
  const root = await mkdtemp(join(tmpdir(), 'oled-test-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const png = await sharp(Buffer.from(pixels.flat()), {
    raw: { width: pixels.length, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  const source = join(root, 'source.png');
  await writeFile(source, png);
  return { root, png, source };
}
test('full-source classification has inclusive percentage/channel boundaries and excludes invisible pixels', async () => {
  const f = await fixture([
    [32, 32, 32, 255],
    [0, 0, 0, 255],
    [31, 31, 31, 255],
    [33, 0, 0, 255],
    ...Array.from({ length: 16 }, () => [255, 255, 255, 255]),
    [0, 0, 0, 0],
  ]);
  expect(await classifySource(f.source)).toEqual({
    candidate: true,
    darkPercentage: 15,
  });
  expect((await classifySource(f.source, 15.01)).candidate).toBe(false);
  expect((await classifySource(f.source, 15, 31)).candidate).toBe(false);
  expect((await classifySource(f.source, 20)).candidate).toBe(false);
  const below = await fixture([
    ...Array.from({ length: 3 }, () => [32, 32, 32, 255]),
    ...Array.from({ length: 18 }, () => [255, 255, 255, 255]),
  ]);
  expect((await classifySource(below.source)).candidate).toBe(false);
  for (const [pixel, expected] of [
    [[0, 0, 0, 255], true],
    [[255, 255, 255, 255], false],
    [[0, 0, 0, 0], false],
  ] as const) {
    const image = await fixture([[...pixel]]);
    expect((await classifySource(image.source)).candidate).toBe(expected);
  }
});
const ai = { enabled: true, baseUrl: 'http://provider/v1', model: 'vision' };
function provider(judge: (cutoff: number) => unknown) {
  const calls: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const prompt = body.messages[0].content;
      let content: string;
      if (prompt === oledPrompt) {
        expect(
          body.messages[1].content.filter(
            (c: { type: string }) => c.type === 'image_url',
          ),
        ).toHaveLength(2);
        const cutoff = Number(
          body.messages[1].content[2].text.match(/cutoff (\d+)/)[1],
        );
        calls.push(cutoff);
        content = JSON.stringify(judge(cutoff));
      } else
        content = prompt.includes('Suggest exactly')
          ? 'dark-art'
          : '{"subject":null,"focal":null}';
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content } }],
      });
    }),
  );
  return calls;
}
test('adaptive search returns highest evaluated acceptable cutoff and honors budget', async () => {
  const f = await fixture([
    [10, 20, 30, 255],
    [255, 255, 255, 255],
  ]);
  const calls = provider((cutoff) => ({ cutoff, acceptable: cutoff <= 42 }));
  const result = await searchCutoff(
    new AiConnection(ai),
    await prepareComparison(f.source),
    8,
    new AbortController().signal,
  );
  expect(calls).toEqual([127, 63, 31, 47, 39, 43, 41, 42]);
  expect(result).toMatchObject({ oled: true, threshold: 42 });
  calls.length = 0;
  expect(
    (
      await searchCutoff(
        new AiConnection(ai),
        await prepareComparison(f.source),
        2,
        new AbortController().signal,
      )
    ).oled,
  ).toBe(false);
  expect(calls).toEqual([127, 63]);
});
test('no-op and universally unacceptable trials recommend off; malformed cutoff is rejected', async () => {
  const f = await fixture([[0, 0, 0, 255]]);
  provider((cutoff) => ({ cutoff, acceptable: true }));
  expect(
    (
      await searchCutoff(
        new AiConnection(ai),
        await prepareComparison(f.source),
        8,
        new AbortController().signal,
      )
    ).oled,
  ).toBe(false);
  provider((cutoff) => ({ cutoff, acceptable: false }));
  expect(
    (
      await searchCutoff(
        new AiConnection(ai),
        await prepareComparison(f.source),
        8,
        new AbortController().signal,
      )
    ).oled,
  ).toBe(false);
  provider(() => ({ cutoff: 256, acceptable: true }));
  await expect(
    searchCutoff(
      new AiConnection(ai),
      await prepareComparison(f.source),
      8,
      new AbortController().signal,
    ),
  ).rejects.toThrow('Invalid OLEDify');
});
async function setup(enabled: boolean, pixels = [[16, 16, 16, 255]]) {
  const f = await fixture(pixels);
  const app = buildApp({
    ...defaults,
    ai: { ...ai, enabled },
    logLevel: 'silent',
    outputDirectory: join(f.root, 'output'),
    dataDirectory: join(f.root, 'data'),
    temporaryDirectory: join(f.root, 'tmp'),
  });
  cleanup.push(() => app.close());
  await app.ready();
  const upload = async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'content-type': 'application/octet-stream' },
      payload: f.png,
    });
    expect(r.statusCode).toBe(200);
    return r.json<Job>();
  };
  return { app, upload };
}
test('AI disabled makes no requests; noncandidates skip OLED search while naming/detection continue', async () => {
  const calls = provider((cutoff) => ({ cutoff, acceptable: true }));
  const local = await setup(false);
  expect((await local.upload()).oledAnalysis).toMatchObject({
    state: 'local',
    oled: true,
    threshold: 16,
  });
  expect(fetch).not.toHaveBeenCalled();
  const bright = await setup(true, [[255, 255, 255, 255]]);
  const job = await bright.upload();
  expect(job.oledAnalysis?.state).toBe('skipped');
  await vi.waitFor(async () =>
    expect(
      (await bright.app.inject(`/api/jobs/${job.id}/naming`)).json().state,
    ).toBe('succeeded'),
  );
  expect(calls).toEqual([]);
});
test('failed search retains local defaults; explicit Retry is bounded and completed results are reused within isolated jobs', async () => {
  const calls = provider(() => ({ cutoff: -1, acceptable: true }));
  const { app, upload } = await setup(true);
  const job = await upload();
  const status = async () =>
    (
      await app.inject(`/api/jobs/${job.id}/oled-analysis`)
    ).json<OledAnalysis>();
  await vi.waitFor(async () => expect((await status()).state).toBe('failed'));
  expect(await status()).toMatchObject({ oled: true, threshold: 16 });
  expect(calls).toHaveLength(1);
  provider((cutoff) => ({ cutoff, acceptable: cutoff <= 32 }));
  await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/oled-analysis`,
  });
  await vi.waitFor(async () =>
    expect((await status()).state).toBe('succeeded'),
  );
  expect(await status()).toMatchObject({ oled: true, threshold: 32 });
  const count = vi.mocked(fetch).mock.calls.length;
  await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/oled-analysis`,
  });
  expect(vi.mocked(fetch).mock.calls.length).toBe(count);
  const other = await upload();
  expect(other.id).not.toBe(job.id);
  await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });
  expect(
    (await app.inject(`/api/jobs/${job.id}/oled-analysis`)).statusCode,
  ).toBe(404);
  expect(
    (await app.inject(`/api/jobs/${other.id}/oled-analysis`)).statusCode,
  ).toBe(200);
});

test.each(['delete', 'expiry', 'shutdown'])(
  'pending searches abort on %s and rejected uploads never analyze',
  async (action) => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.messages[0].content === oledPrompt) {
          const signal = init.signal as AbortSignal;
          signals.push(signal);
          return new Promise<Response>((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('cancelled')),
              { once: true },
            ),
          );
        }
        return Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: body.messages[0].content.includes('Suggest exactly')
                  ? 'dark-image'
                  : '{"subject":null}',
              },
            },
          ],
        });
      }),
    );
    const { app, upload } = await setup(true);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('invalid'),
    });
    expect(bad.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const job = await upload();
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    if (action === 'delete')
      await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });
    else if (action === 'shutdown') await app.close();
    else {
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000);
      try {
        expect(
          (await app.inject(`/api/jobs/${job.id}/oled-analysis`)).statusCode,
        ).toBe(404);
      } finally {
        clock.mockRestore();
      }
    }
    expect(signals[0]!.aborted).toBe(true);
  },
);

test('pending and later completed analysis never rewrite a previously accepted PNG/ZIP/server save', async () => {
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.messages[0].content === oledPrompt)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: body.messages[0].content.includes('Suggest exactly')
                ? 'dark-image'
                : '{"subject":null}',
            },
          },
        ],
      });
    }),
  );
  const { app, upload } = await setup(true);
  const job = await upload();
  await vi.waitFor(() => expect(finish).toBeDefined());
  const id = 'iphone-18-pro-max';
  const render = await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/render`,
    payload: { crops: { [id]: job.smart[id] }, oled: true, threshold: 16 },
  });
  expect(render.statusCode).toBe(200);
  const manifest = render.json<{
    revision: string;
    outputs: Record<string, string>;
  }>();
  const before = await app.inject(manifest.outputs[id]!);
  expect(before.statusCode).toBe(200);
  expect(
    (await app.inject(`/api/jobs/${job.id}/zip/${manifest.revision}`))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/save/${manifest.revision}`,
        payload: { name: 'pending', organizeIntoDeviceFolders: false },
      })
    ).json().state,
  ).toBe('saved');
  // An unacceptable trial must leave accepted exports intact while search continues.
  finish!(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: '{"cutoff":127,"acceptable":false}' },
        },
      ],
    }),
  );
  // Resolve subsequent trials immediately, all unacceptable, to reach a completed off result.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const cutoff = Number(
        body.messages[1].content[2].text.match(/cutoff (\d+)/)[1],
      );
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ cutoff, acceptable: false }) },
          },
        ],
      });
    }),
  );
  await vi.waitFor(async () =>
    expect(
      (await app.inject(`/api/jobs/${job.id}/oled-analysis`)).json(),
    ).toMatchObject({ state: 'succeeded', oled: false }),
  );
  const after = await app.inject(manifest.outputs[id]!);
  expect(after.rawPayload).toEqual(before.rawPayload);
});

test('local analysis failure keeps accepted workflow and manual rendering available, with explicit retry', async () => {
  vi.spyOn(analysis, 'classifySource').mockRejectedValueOnce(
    new Error('controlled failure'),
  );
  const { app, upload } = await setup(false);
  const job = await upload();
  expect(job.oledAnalysis).toMatchObject({
    state: 'failed',
    oled: false,
    threshold: 16,
  });
  expect(job.oledAnalysis?.message).toContain(
    'Manual controls remain available',
  );
  const manual = await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/render`,
    payload: { crops: {}, oled: true, threshold: 23 },
  });
  expect(manual.statusCode).toBe(200);
  const retry = await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/oled-analysis`,
  });
  expect(retry.json()).toMatchObject({
    state: 'local',
    candidate: true,
    oled: true,
    threshold: 16,
  });
});
