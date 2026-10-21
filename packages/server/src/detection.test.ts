import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test, vi } from 'vitest';
import { buildApp } from './app.js';
import defaults from '../../../config/default.json' with { type: 'json' };
import { detectionPrompt, parseBounds, subjectCrop } from './detection.js';
import { cropSize } from './imaging.js';
import { devices, defaultPreferences } from './workflow.js';
import type { DetectionStatus, Job } from './protocol.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const bounds = { left: 0.1, top: 0.2, right: 0.35, bottom: 0.4 };
const answer = (subject: unknown = bounds) =>
  Response.json({
    choices: [
      {
        finish_reason: 'stop',
        message: { content: JSON.stringify({ subject }) },
      },
    ],
  });
async function setup(
  enabled = true,
  token: string | undefined = 'private-secret',
) {
  const root = await mkdtemp(join(tmpdir(), 'detection-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const config = {
    ...defaults,
    logLevel: 'silent' as const,
    dataDirectory: join(root, 'data'),
    temporaryDirectory: join(root, 'tmp'),
    ai: { enabled, baseUrl: 'http://service/v1', model: 'vision', token },
  };
  const app = buildApp(config);
  cleanup.push(() => app.close());
  await app.ready();
  return { app, config };
}
async function upload(app: ReturnType<typeof buildApp>) {
  const data = await sharp({
    create: { width: 1800, height: 600, channels: 3, background: '#123456' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const r = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'content-type': 'application/octet-stream' },
    payload: data,
  });
  expect(r.statusCode).toBe(200);
  return r.json<Job>();
}
async function status(
  app: ReturnType<typeof buildApp>,
  job: Job,
  state: string,
) {
  let result!: DetectionStatus;
  await vi.waitFor(async () => {
    result = (await app.inject(`/api/jobs/${job.id}/detection`)).json();
    expect(result.state).toBe(state);
  });
  return result;
}
test('prompt permits groups and no subject and ignores image instructions; strict bounds fixtures', () => {
  for (const word of [
    'coherent group',
    'image content',
    'normalized',
    'subject": null',
  ])
    expect(detectionPrompt).toContain(word);
  expect(parseBounds(JSON.stringify({ subject: bounds }))).toEqual(bounds);
  expect(parseBounds('{"subject":null}')).toBeNull();
  for (const text of [
    '',
    '{}',
    'null',
    '[]',
    '{"subject":{}}',
    '{"subject":{"left":0,"top":0,"right":1e999,"bottom":1}}',
    JSON.stringify({ subject: { ...bounds, left: 0.5 } }),
    JSON.stringify({ subject: { ...bounds, right: 2 } }),
    JSON.stringify({ subject: { ...bounds, top: -0.1 } }),
    JSON.stringify({ subject: { ...bounds, bottom: bounds.top } }),
    JSON.stringify({ subject: { ...bounds, left: '0.1' } }),
    '```json\n{"subject":null}\n```',
  ])
    expect(() => parseBounds(text)).toThrow();
});
test('fixed-size device crops contain fitting subjects and maximize retained group area with centered ties', () => {
  const shapes = [
    { width: 9, height: 16 },
    { width: 1, height: 1 },
    { width: 16, height: 9 },
  ];
  for (const shape of shapes)
    for (const b of [
      bounds,
      { left: 0, top: 0, right: 1, bottom: 1 },
      { left: 0.8, top: 0.8, right: 1, bottom: 1 },
    ]) {
      const device = { ...shape, id: 'd', name: 'D' };
      const c = subjectCrop(160, 100, device, b);
      expect({ width: c.width, height: c.height }).toEqual({
        width: cropSize(160, 100, device).width,
        height: cropSize(160, 100, device).height,
      });
      const overlap = (start: number, size: number, lo: number, hi: number) =>
        Math.max(0, Math.min(start + size, hi) - Math.max(start, lo));
      for (const [start, size, limit, lo, hi] of [
        [c.left, c.width, 160, b.left * 160, b.right * 160],
        [c.top, c.height, 100, b.top * 100, b.bottom * 100],
      ]) {
        expect(start!).toBeGreaterThanOrEqual(0);
        expect(start! + size!).toBeLessThanOrEqual(limit!);
        const best = Math.max(
          ...Array.from({ length: limit! - size! + 1 }, (_, i) =>
            overlap(i, size!, lo!, hi!),
          ),
        );
        expect(overlap(start!, size!, lo!, hi!)).toBeCloseTo(best);
        if (hi! - lo! <= size!) {
          expect(start!).toBeLessThanOrEqual(lo!);
          expect(start! + size!).toBeGreaterThanOrEqual(hi!);
        }
      }
    }
});
test.each([true, false])(
  'automatic detection uses bounded oriented full source, optional authentication and one request per job (auth=%s)',
  async (auth) => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.messages[0].content !== detectionPrompt)
        return Response.json({
          choices: [
            { finish_reason: 'stop', message: { content: 'forest-name' } },
          ],
        });
      expect(body.model).toBe('vision');
      expect(init.headers).toEqual({
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: 'Bearer private-secret' } : {}),
      });
      const image = Buffer.from(
        body.messages[1].content[0].image_url.url.split(',')[1],
        'base64',
      );
      expect(await sharp(image).metadata()).toMatchObject({
        width: 341,
        height: 1024,
      });
      expect(image.length).toBeLessThanOrEqual(2 * 1024 * 1024);
      return answer();
    });
    vi.stubGlobal('fetch', fetch);
    const { app } = await setup(true, auth ? 'private-secret' : '');
    const job = await upload(app);
    expect([job.width, job.height]).toEqual([600, 1800]);
    const result = await status(app, job, 'succeeded');
    if (result.state !== 'succeeded') throw new Error();
    for (const device of devices)
      expect(result.crops[device.id]).toEqual(
        subjectCrop(600, 1800, device, bounds),
      );
    for (let i = 0; i < 3; i++)
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/detection`,
      });
    await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/render`,
      payload: {
        crops: { [devices[0]!.id]: result.crops[devices[0]!.id] },
        oled: true,
        threshold: 20,
      },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('private-secret');
  },
);
test('disabled and rejected uploads start no detection', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { app } = await setup(false);
  const job = await upload(app);
  expect(job.detection).toEqual({ state: 'disabled' });
  await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/detection` });
  const enabled = await setup();
  await enabled.app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'content-type': 'application/octet-stream' },
    payload: Buffer.from('bad'),
  });
  expect(fetch).not.toHaveBeenCalled();
});
test.each([
  401,
  429,
  400,
  500,
  'invalid',
  'connection',
  'refusal',
  'no-subject',
])(
  'detection %s settles independently; explicit retry deduplicates and does not restart naming',
  async (failure) => {
    let complete!: (response: Response) => void;
    let attempts = 0,
      naming = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (
          JSON.parse(init.body as string).messages[0].content !==
          detectionPrompt
        ) {
          naming++;
          return Response.json({
            choices: [
              { finish_reason: 'stop', message: { content: 'good-name' } },
            ],
          });
        }
        if (++attempts > 1)
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        if (typeof failure === 'number')
          return new Response('private-secret', { status: failure });
        if (failure === 'connection') throw new Error('private-secret');
        if (failure === 'refusal')
          return Response.json({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: '{}', refusal: 'private-secret' },
              },
            ],
          });
        return failure === 'no-subject'
          ? answer(null)
          : answer({ ...bounds, right: -1 });
      }),
    );
    const { app } = await setup();
    const job = await upload(app);
    const result = await status(
      app,
      job,
      failure === 'no-subject' ? 'no-subject' : 'failed',
    );
    expect(JSON.stringify(result)).not.toContain('private-secret');
    await vi.waitFor(async () =>
      expect(
        (await app.inject(`/api/jobs/${job.id}/naming`)).json().state,
      ).toBe('succeeded'),
    );
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/detection` });
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/detection` });
    if (failure === 'no-subject') {
      expect(attempts).toBe(1);
      return;
    }
    expect(attempts).toBe(2);
    expect(naming).toBe(1);
    complete(answer());
    await status(app, job, 'succeeded');
  },
);
test('discard and expiry cancel both tasks and cannot affect a later workflow', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener('abort', () =>
            reject(new Error('cancelled')),
          );
        }),
    ),
  );
  const { app } = await setup();
  const job = await upload(app);
  expect(signals).toHaveLength(2);
  await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });
  expect(signals.every((s) => s.aborted)).toBe(true);
  expect((await app.inject(`/api/jobs/${job.id}/detection`)).statusCode).toBe(
    404,
  );
  const next = await upload(app);
  expect(next.detection?.state).toBe('pending');
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 31 * 60000);
  expect((await app.inject(`/api/jobs/${next.id}/detection`)).statusCode).toBe(
    404,
  );
  expect(signals.every((s) => s.aborted)).toBe(true);
});
test.each(['smart', 'ai', 'entropy', 'anchor'] as const)(
  'preference %s migrates and persists across enabled/disabled restarts',
  async (method) => {
    const { app, config } = await setup();
    await app.close();
    const path = join(config.dataDirectory, 'preferences.json');
    await writeFile(
      path,
      JSON.stringify({ ...defaultPreferences, method, anchor: 'top-left' }),
    );
    const next = buildApp(config);
    cleanup.push(() => next.close());
    const prefs = (await next.inject('/api/catalog')).json().preferences;
    expect(prefs.method).toBe(method === 'smart' ? 'ai' : method);
    expect(prefs.anchor).toBe('top-left');
    await next.close();
    const disabled = buildApp({ ...config, ai: { enabled: false } });
    cleanup.push(() => disabled.close());
    const resolved = (await disabled.inject('/api/catalog')).json().preferences;
    expect(resolved.method).toBe(
      ['smart', 'ai'].includes(method) ? 'entropy' : method,
    );
    expect(JSON.parse(await readFile(path, 'utf8')).method).toBe(
      resolved.method,
    );
  },
);

test('detection succeeds when naming fails and a naming retry never restarts detection', async () => {
  let detections = 0,
    names = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (
        JSON.parse(init.body as string).messages[0].content === detectionPrompt
      ) {
        detections++;
        return answer();
      }
      names++;
      return new Response('private-secret', { status: 500 });
    }),
  );
  const { app } = await setup();
  const job = await upload(app);
  await status(app, job, 'succeeded');
  await vi.waitFor(async () =>
    expect((await app.inject(`/api/jobs/${job.id}/naming`)).json().state).toBe(
      'failed',
    ),
  );
  await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/naming` });
  expect(names).toBe(2);
  expect(detections).toBe(1);
});
test('preparation failure is nonblocking and Retry prepares again without restarting naming', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => answer()),
  );
  const { app } = await setup();
  const payload = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  const prepare = vi
    .spyOn(sharp.prototype, 'jpeg')
    .mockImplementationOnce(() => {
      throw new Error('private-secret');
    });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'content-type': 'application/octet-stream' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    const job = response.json<Job>();
    expect(job.naming?.state).toBe('failed');
    expect(job.detection?.state).toBe('failed');
    expect(response.body).not.toContain('private-secret');
    await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/detection` });
    await status(app, job, 'succeeded');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await app.inject(`/api/jobs/${job.id}/naming`)).json().state).toBe(
      'failed',
    );
  } finally {
    prepare.mockRestore();
  }
});
test('request timeout settles detection safely and leaves local processing available', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new Error('private-secret')),
          );
        }),
    ),
  );
  const { app } = await setup();
  const job = await upload(app);
  expect(job.detection?.state).toBe('pending');
  await vi.advanceTimersByTimeAsync(30_000);
  const result = (await app.inject(`/api/jobs/${job.id}/detection`)).json();
  expect(result.state).toBe('failed');
  expect(JSON.stringify(result)).not.toContain('private-secret');
  expect((await app.inject('/api/health')).statusCode).toBe(200);
});

test('focal bounds are optional, strictly validated inside the subject, and nested unvalidated fields are ignored', () => {
  const subject = { left: 0.1, top: 0, right: 0.8, bottom: 1 };
  const focal = { left: 0.25, top: 0.05, right: 0.4, bottom: 0.3 };
  expect(parseBounds(JSON.stringify({ subject, focal }))).toEqual({
    ...subject,
    focal,
  });
  expect(parseBounds(JSON.stringify({ subject, focal: null }))).toEqual(
    subject,
  );
  expect(
    parseBounds(
      JSON.stringify({ subject: { ...subject, focal: { left: -99 } } }),
    ),
  ).toEqual(subject);
  for (const f of [
    {},
    { ...focal, left: -0.1 },
    { ...focal, right: 1 },
    { ...focal, top: '0.1' },
    { ...focal, bottom: Infinity },
    { ...focal, right: focal.left },
  ]) {
    expect(() => parseBounds(JSON.stringify({ subject, focal: f }))).toThrow();
  }
  for (const phrase of [
    'focal region',
    'entire face/head',
    "group's important faces/details",
    'inside the subject',
  ])
    expect(detectionPrompt).toContain(phrase);
});
test('phone framing contains an off-center face while a fitting tablet crop retains the entire subject', () => {
  // Regression: body-centered framing starts near x=445 and cuts through the face.
  const subject = { left: 0.1, top: 0, right: 0.81, bottom: 1 };
  const focal = { left: 0.23, top: 0, right: 0.42, bottom: 0.3 };
  const phone = { id: 'phone', name: 'Phone', width: 1320, height: 2868 };
  const old = subjectCrop(1366, 768, phone, subject);
  const next = subjectCrop(1366, 768, phone, { ...subject, focal });
  expect(old.left).toBeGreaterThan(focal.left * 1366);
  expect(next.left).toBeLessThanOrEqual(focal.left * 1366);
  expect(next.left + next.width).toBeGreaterThanOrEqual(focal.right * 1366);
  expect(next.top).toBe(0);
  expect(next.height).toBe(768);
  const tablet = { id: 'tablet', name: 'Tablet', width: 1, height: 1 };
  const fitting = { left: 0.2, top: 0, right: 0.7, bottom: 1, focal };
  expect(subjectCrop(1366, 768, tablet, fitting)).toEqual(
    subjectCrop(1366, 768, tablet, {
      left: fitting.left,
      top: fitting.top,
      right: fitting.right,
      bottom: fitting.bottom,
    }),
  );
});
test('focal framing maximizes focal and remaining group overlap across aspect ratios and source edges', () => {
  const deviceShapes = [
    { width: 9, height: 16 },
    { width: 1, height: 1 },
    { width: 16, height: 9 },
  ];
  for (const device of deviceShapes)
    for (const focal of [
      { left: 0.1, top: 0.1, right: 0.3, bottom: 0.35 },
      { left: 0.7, top: 0.7, right: 0.9, bottom: 0.9 },
      { left: 0.15, top: 0.15, right: 0.85, bottom: 0.85 }, // wide group focal region
    ]) {
      const subject = {
        left: 0.05,
        top: 0.05,
        right: 0.95,
        bottom: 0.95,
        focal,
      };
      const c = subjectCrop(
        160,
        100,
        { ...device, id: 'd', name: 'D' },
        subject,
      );
      const overlap = (x: number, size: number, lo: number, hi: number) =>
        Math.max(0, Math.min(x + size, hi) - Math.max(x, lo));
      for (const [start, size, limit, lo, hi, flo, fhi] of [
        [c.left, c.width, 160, 8, 152, focal.left * 160, focal.right * 160],
        [c.top, c.height, 100, 5, 95, focal.top * 100, focal.bottom * 100],
      ]) {
        const candidates = Array.from(
          { length: limit! - size! + 1 },
          (_, i) => i,
        );
        expect(overlap(start!, size!, flo!, fhi!)).toBeCloseTo(
          Math.max(...candidates.map((x) => overlap(x, size!, flo!, fhi!))),
        );
        expect(overlap(start!, size!, lo!, hi!)).toBeCloseTo(
          Math.max(...candidates.map((x) => overlap(x, size!, lo!, hi!))),
        );
        expect(start!).toBeGreaterThanOrEqual(0);
        expect(start! + size!).toBeLessThanOrEqual(limit!);
      }
    }
});
test('controlled focal detection is mapped from oriented representation to every device crop', async () => {
  const subject = { left: 0.05, top: 0.05, right: 0.95, bottom: 0.95 };
  const focal = { left: 0.1, top: 0.15, right: 0.3, bottom: 0.25 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                body.messages[0].content === detectionPrompt
                  ? JSON.stringify({ subject, focal })
                  : 'forest-name',
            },
          },
        ],
      });
    }),
  );
  const { app } = await setup();
  const job = await upload(app);
  const result = await status(app, job, 'succeeded');
  if (result.state !== 'succeeded') throw new Error();
  for (const device of devices)
    expect(result.crops[device.id]).toEqual(
      subjectCrop(600, 1800, device, { ...subject, focal }),
    );
});

test('prompt prioritizes people and faces over held weapons while retaining object-only and group subjects', () => {
  for (const instruction of [
    'semantic importance',
    'person is normally the subject',
    'do not expand',
    'entire face/head',
    'Do not choose a held weapon',
    'halfway between the face and a prop',
    'standalone sword',
    'when a face is not visible',
    "group's important faces/details",
    'Before answering',
    'Measure the actual image',
  ])
    expect(detectionPrompt).toContain(instruction);
  expect(detectionPrompt).not.toContain('"left": 0.1');
});
test('controlled person-with-sword response frames the person in portrait and wider crops', async () => {
  // Representative response fixture, not an assertion that a model recognizes an image.
  const subject = { left: 0.49, top: 0.2, right: 0.67, bottom: 0.85 };
  const focal = { left: 0.59, top: 0.2, right: 0.64, bottom: 0.32 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                JSON.parse(init.body as string).messages[0].content ===
                detectionPrompt
                  ? JSON.stringify({ subject, focal })
                  : 'aurora-character',
            },
          },
        ],
      }),
    ),
  );
  const { app } = await setup();
  const payload = await sharp({
    create: { width: 2000, height: 844, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  const response = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'content-type': 'application/octet-stream' },
    payload,
  });
  const job = response.json<Job>();
  const result = await status(app, job, 'succeeded');
  if (result.state !== 'succeeded') throw new Error();
  for (const device of devices) {
    const crop = result.crops[device.id]!;
    expect(crop.left).toBeLessThanOrEqual(focal.left * job.width);
    expect(crop.left + crop.width).toBeGreaterThanOrEqual(
      focal.right * job.width,
    );
    expect(crop.top).toBeLessThanOrEqual(focal.top * job.height);
    expect(crop.top + crop.height).toBeGreaterThanOrEqual(
      focal.bottom * job.height,
    );
  }
});
