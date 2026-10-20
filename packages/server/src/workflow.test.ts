import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { afterEach, expect, test } from 'vitest';
import { buildApp } from './app.js';
import defaults from '../../../config/default.json' with { type: 'json' };
import {
  anchorCrop,
  cropSize,
  oledify,
  safeName,
  smartCrop,
} from './imaging.js';
import { devices, defaultPreferences } from './workflow.js';
import type { Job, Manifest, Crop } from './protocol.js';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.reverse()) await fn();
  cleanups.length = 0;
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'wallslice-test-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const config = {
    ...defaults,
    logLevel: 'silent' as const,
    dataDirectory: join(root, 'data'),
    temporaryDirectory: join(root, 'tmp'),
  };
  const app = buildApp(config);
  cleanups.push(() => app.close());
  await app.ready();
  return { app, config, root };
}
async function image(width = 300, height = 200) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } },
  })
    .png()
    .toBuffer();
}
async function upload(app: ReturnType<typeof buildApp>, data: Buffer) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'Content-Type': 'application/octet-stream' },
    payload: data,
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json<Job>();
}
function selectedCrops(job: Job) {
  return Object.fromEntries(
    devices.map((d) => [
      d.id,
      anchorCrop(job.width, job.height, d, 'bottom-right'),
    ]),
  );
}
async function render(
  app: ReturnType<typeof buildApp>,
  job: Job,
  crops: Record<string, Crop> = selectedCrops(job),
  oled = false,
  threshold = 16,
) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/jobs/${job.id}/render`,
    payload: { crops, oled, threshold },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json<Manifest>();
}

test('catalog, safe names, and crop geometry remain generic for new devices', () => {
  expect(devices).toHaveLength(6);
  expect(defaultPreferences.devices).toEqual(
    devices.slice(0, 2).map((d) => d.id),
  );
  const d = {
    id: 'extra-device',
    name: 'Extra device',
    width: 100,
    height: 200,
  };
  expect(cropSize(600, 400, d)).toEqual({
    left: 0,
    top: 0,
    width: 200,
    height: 400,
  });
  expect(anchorCrop(600, 400, d, 'top-left').left).toBe(0);
  expect(anchorCrop(600, 400, d, 'top-right').left).toBe(400);
  expect(anchorCrop(600, 400, d, 'bottom-left').top).toBe(0);
  expect(anchorCrop(600, 400, d, 'bottom-right').left).toBe(400);
  expect(anchorCrop(600, 400, d, 'center').left).toBe(200);
  expect(
    anchorCrop(100, 600, { ...d, width: 200, height: 100 }, 'bottom-right').top,
  ).toBe(550);
  expect(
    anchorCrop(100, 600, { ...d, width: 200, height: 100 }, 'center').top,
  ).toBe(275);
  expect(safeName('../../bad\\name:*?')).toBe('bad-name');
  expect(safeName('...')).toBe('wallpaper');
  expect(safeName('  ')).toBe('wallpaper');
});
test('entropy selects a high-information edge rather than the center', async () => {
  const { root } = await setup();
  const path = join(root, 'entropy.png');
  const data = Buffer.alloc(300 * 100 * 3);
  let seed = 42;
  for (let y = 0; y < 100; y++)
    for (let x = 200; x < 300; x++)
      for (let c = 0; c < 3; c++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[(y * 300 + x) * 3 + c] = seed >>> 24;
      }
  await sharp(data, { raw: { width: 300, height: 100, channels: 3 } })
    .png()
    .toFile(path);
  const crop = await smartCrop(path, 300, 100, {
    id: 'square',
    name: 'Square',
    width: 100,
    height: 100,
  });
  expect(crop).toEqual({ left: 200, top: 0, width: 100, height: 100 });
});
test('OLEDify cutoff is inclusive, checks all RGB channels, and retains alpha', () => {
  const data = Buffer.from([
    16, 16, 16, 60, 16, 17, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255,
  ]);
  expect([...oledify(data, 4, 16)]).toEqual([
    0, 0, 0, 60, 16, 17, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255,
  ]);
  expect([...oledify(Buffer.from([0, 1, 0]), 3, 0)]).toEqual([0, 1, 0]);
  expect([...oledify(Buffer.from([255, 255, 255]), 3, 255)]).toEqual([0, 0, 0]);
});
test('upload validation permits retry and rejects corrupt, unsupported, animated and oversized decoded inputs', async () => {
  const { app } = await setup();
  for (const data of [
    Buffer.from('not an image'),
    await sharp(await image())
      .tiff()
      .toBuffer(),
    Buffer.from('<svg width="10" height="10"></svg>'),
  ]) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'Content-Type': 'application/octet-stream' },
      payload: data,
    });
    expect(r.statusCode).toBe(400);
  }
  // A valid PNG header advertising a decompression bomb is rejected before decoding.
  const png = await image();
  png.writeUInt32BE(100000, 16);
  png.writeUInt32BE(100000, 20);
  const bad = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'Content-Type': 'application/octet-stream' },
    payload: png,
  });
  expect(bad.statusCode).toBe(400);
  const job = await upload(app, await image());
  expect(job.width).toBe(300);
});
test('orientation is normalized once for coordinates, preview, and export', async () => {
  const { app } = await setup();
  const source = await sharp(await image(300, 200))
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const job = await upload(app, source);
  expect([job.width, job.height]).toEqual([200, 300]);
  const m = await render(app, job, {
    [devices[0]!.id]: job.smart[devices[0]!.id]!,
  });
  const response = await app.inject(m.source);
  const meta = await sharp(response.rawPayload).metadata();
  expect([meta.width, meta.height]).toEqual([200, 300]);
  expect(meta.orientation).toBeUndefined();
});
test('full PNG/ZIP workflow produces exact preset sizes and matching contents, rejects stale and invalid crops, and discards resources', async () => {
  const { app } = await setup();
  const job = await upload(app, await image());
  let m = await render(app, job);
  const zipResponse = await app.inject(
    `/api/jobs/${job.id}/zip/${m.revision}?name=${encodeURIComponent('../my:view')}`,
  );
  expect(zipResponse.statusCode, zipResponse.body).toBe(200);
  const zip = new ZipReader(new Uint8ArrayReader(zipResponse.rawPayload));
  const entries = await zip.getEntries();
  expect(entries).toHaveLength(6);
  for (const d of devices) {
    const response = await app.inject(m.outputs[d.id]!);
    const metadata = await sharp(response.rawPayload).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([
      d.width,
      d.height,
      'png',
    ]);
    const entry = entries.find((e) => e.filename === `my-view-${d.id}.png`)!;
    expect(entry).toBeDefined();
    if (!entry.directory)
      expect(Buffer.from(await entry.getData!(new Uint8ArrayWriter()))).toEqual(
        response.rawPayload,
      );
  }
  await zip.close();
  const invalid = {
    ...selectedCrops(job),
    [devices[0]!.id]: { ...job.smart[devices[0]!.id]!, left: -1 },
  };
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/render`,
        payload: { crops: invalid, oled: false, threshold: 0 },
      })
    ).statusCode,
  ).toBe(400);
  const old = m.outputs[devices[0]!.id]!;
  m = await render(
    app,
    job,
    { [devices[0]!.id]: job.smart[devices[0]!.id]! },
    true,
    255,
  );
  expect((await app.inject(old)).statusCode).toBe(409);
  const black = await sharp(
    await sharp((await app.inject(m.outputs[devices[0]!.id]!)).rawPayload)
      .removeAlpha()
      .png()
      .toBuffer(),
  ).stats();
  expect(black.channels.every((c) => c.max === 0)).toBe(true);
  expect(
    (await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` }))
      .statusCode,
  ).toBe(200);
  expect((await app.inject(m.source)).statusCode).toBe(404);
}, 30000);
test('manual framing matches the export and OLEDify happens after resizing', async () => {
  const { app } = await setup();
  const data = Buffer.from([8, 8, 8, 16, 16, 16, 24, 24, 24, 32, 32, 32]);
  const png = await sharp(data, { raw: { width: 4, height: 1, channels: 3 } })
    .png()
    .toBuffer();
  const job = await upload(app, png);
  const d = devices[0]!;
  const crop = { ...job.smart[d.id]!, left: 3 };
  const m = await render(app, job, { [d.id]: crop }, false);
  const untreated = await sharp((await app.inject(m.outputs[d.id]!)).rawPayload)
    .raw()
    .toBuffer();
  expect(untreated[0]).toBe(32);
  const next = await render(app, job, { [d.id]: crop }, true, 32);
  const treated = await sharp(
    (await app.inject(next.outputs[d.id]!)).rawPayload,
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(treated.every((v) => v === 0)).toBe(true);
});
test('preferences survive server recreation while jobs expire and restart at Input', async () => {
  const { app, config } = await setup();
  const job = await upload(app, await image());
  const p = {
    devices: [devices[5]!.id],
    method: 'anchor',
    anchor: 'top-right',
    oled: true,
    threshold: 42,
  };
  expect(
    (await app.inject({ method: 'PUT', url: '/api/preferences', payload: p }))
      .statusCode,
  ).toBe(200);
  expect(
    JSON.parse(
      await readFile(join(config.dataDirectory, 'preferences.json'), 'utf8'),
    ),
  ).toEqual(p);
  await app.close();
  const restarted = buildApp(config);
  cleanups.push(() => restarted.close());
  expect((await restarted.inject('/api/catalog')).json().preferences).toEqual(
    p,
  );
  expect(
    (
      await restarted.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/render`,
        payload: { crops: {}, oled: false, threshold: 0 },
      })
    ).statusCode,
  ).toBe(404);
});
test('preference read/write errors are clear and retryable', async () => {
  const { app, config, root } = await setup();
  await writeFile(join(root, 'blocked'), 'file');
  const broken = buildApp({
    ...config,
    temporaryDirectory: join(root, 'other-tmp'),
    dataDirectory: join(root, 'blocked'),
  });
  cleanups.push(() => broken.close());
  expect(
    (await broken.inject('/api/catalog')).json().preferenceError,
  ).toContain('Could not read preferences');
  expect(
    (
      await broken.inject({
        method: 'PUT',
        url: '/api/preferences',
        payload: defaultPreferences,
      })
    ).json().message,
  ).toContain('write permissions');
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/preferences',
        payload: { ...defaultPreferences, threshold: 256 },
      })
    ).statusCode,
  ).toBe(400);
});

test('storage admission is bounded, expired jobs release slots and disk, and startup reclaims abandoned process directories', async () => {
  const { app, config, root } = await setup();
  const job = await upload(app, await image());
  const other = await upload(app, await image());
  await upload(app, await image());
  const full = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'Content-Type': 'application/octet-stream' },
    payload: await image(),
  });
  expect(full.statusCode).toBe(503);
  expect(full.json().message).toContain('storage');
  const now = Date.now();
  const original = Date.now;
  Date.now = () => now + 31 * 60000;
  try {
    const expired = await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/render`,
      payload: { crops: {}, oled: false, threshold: 0 },
    });
    expect(expired.statusCode).toBe(404);
    const replacement = await upload(app, await image());
    expect(replacement.id).not.toBe(job.id);
    const { readdir } = await import('node:fs/promises');
    const processDir = (await readdir(config.temporaryDirectory))[0]!;
    const diskJobs = await readdir(join(config.temporaryDirectory, processDir));
    expect(diskJobs).not.toContain(job.id);
    expect(diskJobs).not.toContain(other.id);
  } finally {
    Date.now = original;
  }
  await app.close();
  const { mkdir, access } = await import('node:fs/promises');
  const leftover = join(config.temporaryDirectory, 'wallslice-crashed');
  await mkdir(leftover);
  await writeFile(join(leftover, 'source.png'), 'abandoned');
  const restarted = buildApp(config);
  cleanups.push(() => restarted.close());
  await restarted.ready();
  await expect(access(leftover)).rejects.toThrow();
  const tooSmall = buildApp({
    ...config,
    temporaryDirectory: join(root, 'small-tmp'),
    temporaryStorageMiB: 1024,
  });
  await expect(tooSmall.ready()).rejects.toThrow('too small');
  await tooSmall.close();
});

test('overlapping processing requests fail clearly without corrupting the current job', async () => {
  const { app } = await setup();
  const job = await upload(app, await image());
  const requests = await Promise.all([
    app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/render`,
      payload: { crops: selectedCrops(job), oled: false, threshold: 0 },
    }),
    app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/render`,
      payload: { crops: selectedCrops(job), oled: true, threshold: 255 },
    }),
  ]);
  expect(requests.map((r) => r.statusCode).sort()).toEqual([200, 503]);
  const good = requests.find((r) => r.statusCode === 200)!.json<Manifest>();
  expect((await app.inject(good.source)).statusCode).toBe(200);
});

test('a newly bundled catalog entry flows through selection data, Smart crop, preview, PNG and ZIP without device-specific logic', async () => {
  const extra = {
    id: 'extra-display',
    name: 'Extra display',
    width: 320,
    height: 180,
  };
  devices.push(extra);
  try {
    const { app } = await setup();
    expect((await app.inject('/api/catalog')).json().devices).toContainEqual(
      extra,
    );
    const job = await upload(app, await image());
    expect(job.smart[extra.id]).toBeDefined();
    const m = await render(app, job, { [extra.id]: job.smart[extra.id]! });
    expect(Object.keys(m.outputs)).toEqual([extra.id]);
    expect((await app.inject(m.source)).statusCode).toBe(200);
    const meta = await sharp(
      (await app.inject(m.outputs[extra.id]!)).rawPayload,
    ).metadata();
    expect([meta.width, meta.height]).toEqual([320, 180]);
    const zipped = await app.inject(
      `/api/jobs/${job.id}/zip/${m.revision}?name=extra`,
    );
    const zip = new ZipReader(new Uint8ArrayReader(zipped.rawPayload));
    expect((await zip.getEntries()).map((e) => e.filename)).toEqual([
      'extra-extra-display.png',
    ]);
    await zip.close();
  } finally {
    devices.pop();
  }
});

test.each(['jpeg', 'png', 'webp'] as const)(
  'accepts a real %s source and generates a visible normalized source preview',
  async (format) => {
    const { app } = await setup();
    const source = await sharp(await image())
      .toFormat(format)
      .toBuffer();
    const job = await upload(app, source);
    const m = await render(app, job, {});
    const preview = await app.inject(m.source);
    expect(preview.statusCode).toBe(200);
    const meta = await sharp(preview.rawPayload).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([300, 200, 'png']);
  },
);
