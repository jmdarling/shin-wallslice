import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  symlink,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test, vi } from 'vitest';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { buildApp } from './app.js';
import defaults from '../../../config/default.json' with { type: 'json' };
import type { Job, Manifest, SaveResult } from './protocol.js';
import { devices } from './workflow.js';
import * as imaging from './imaging.js';
import { ServerOutput } from './server-output.js';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});
async function fixture(enabled = true) {
  const root = await mkdtemp(join(tmpdir(), 'wallslice-save-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const outputDirectory = join(root, 'output');
  const config = {
    ...defaults,
    logLevel: 'silent' as const,
    dataDirectory: join(root, 'data'),
    temporaryDirectory: join(root, 'tmp'),
    ...(enabled ? { outputDirectory } : {}),
  };
  const app = buildApp(config);
  cleanup.push(() => app.close());
  await app.ready();
  const upload = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { 'content-type': 'application/octet-stream' },
    payload: await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#101010' },
    })
      .png()
      .toBuffer(),
  });
  const job = upload.json<Job>();
  const render = () =>
    app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/render`,
      payload: {
        crops: { [devices[0]!.id]: job.smart[devices[0]!.id] },
        oled: true,
        threshold: 16,
      },
    });
  const manifest = (await render()).json<Manifest>();
  const save = (
    body: Record<string, unknown> = {},
    revision = manifest.revision,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/save/${revision}`,
      payload: { name: '../../', organizeIntoDeviceFolders: false, ...body },
    });
  return { root, outputDirectory, config, app, job, manifest, render, save };
}

test('disabled saving has no API capability and ordinary exports remain available', async () => {
  const f = await fixture(false);
  expect((await f.app.inject('/api/catalog')).json().serverSavingEnabled).toBe(
    false,
  );
  expect((await f.save()).statusCode).toBe(404);
  expect(
    (await f.app.inject(`/api/jobs/${f.job.id}/zip/${f.manifest.revision}`))
      .statusCode,
  ).toBe(200);
  await expect(readFile(f.outputDirectory)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test.each([false, true])(
  'saving layout folders=%s matches ZIP bytes and persists through disposal and restart',
  async (folders) => {
    const f = await fixture();
    await expect(readdir(f.outputDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const zip = await f.app.inject(
      `/api/jobs/${f.job.id}/zip/${f.manifest.revision}?name=..%2F..%2F&organizeIntoDeviceFolders=${folders}`,
    );
    const reader = new ZipReader(new Uint8ArrayReader(zip.rawPayload));
    const entries = await reader.getEntries();
    const result = (
      await f.save({ organizeIntoDeviceFolders: folders })
    ).json<SaveResult>();
    expect(result.state).toBe('saved');
    expect(result.saved).toEqual(entries.map((e) => e.filename));
    for (const e of entries) {
      if (e.directory) throw new Error('Unexpected ZIP directory entry');
      const contents = await readFile(join(f.outputDirectory, e.filename));
      expect(contents).toEqual(
        Buffer.from(await e.getData!(new Uint8ArrayWriter())),
      );
      expect(await sharp(contents).metadata()).toMatchObject({
        width: devices[0]!.width,
        height: devices[0]!.height,
      });
    }
    await reader.close();
    await writeFile(join(f.outputDirectory, 'unrelated.txt'), 'keep');
    await f.app.inject({ method: 'DELETE', url: `/api/jobs/${f.job.id}` });
    expect((await f.save()).statusCode).toBe(404);
    await f.app.close();
    const restarted = buildApp(f.config);
    cleanup.push(() => restarted.close());
    await restarted.ready();
    for (const path of result.saved)
      expect(
        (await readFile(join(f.outputDirectory, path))).length,
      ).toBeGreaterThan(0);
    expect(
      await readFile(join(f.outputDirectory, 'unrelated.txt'), 'utf8'),
    ).toBe('keep');
  },
);

test('conflicts require explicit approval, cancel does not write, changed files and selections require fresh review', async () => {
  const f = await fixture();
  const first = (await f.save()).json<SaveResult>();
  const path = join(f.outputDirectory, first.saved[0]!);
  await writeFile(path, 'old image');
  const review = (await f.save()).json<SaveResult>();
  expect(review.state).toBe('conflicts');
  expect(review.saved).toEqual([]);
  expect(review.conflicts).toEqual(first.saved);
  // Cancel means no confirmation request; all files remain unchanged.
  expect(await readFile(path, 'utf8')).toBe('old image');
  await writeFile(path, 'changed after review');
  const renewed = (
    await f.save({ confirmation: review.confirmation })
  ).json<SaveResult>();
  expect(renewed.state).toBe('conflicts');
  expect(renewed.confirmation).not.toBe(review.confirmation);
  expect(await readFile(path, 'utf8')).toBe('changed after review');
  expect(
    (await f.save({ confirmation: renewed.confirmation })).json().state,
  ).toBe('saved');
  const again = (await f.save()).json<SaveResult>();
  const nextManifest = (await f.render()).json<Manifest>();
  expect((await f.save({ confirmation: again.confirmation })).statusCode).toBe(
    409,
  );
  expect(
    (
      await f.save({ confirmation: again.confirmation }, nextManifest.revision)
    ).json().state,
  ).toBe('conflicts');
  // A review for a different name may never replace an existing destination.
  const otherName = first.saved[0]!.replace('wallpaper', 'other');
  await writeFile(join(f.outputDirectory, otherName), 'other');
  expect(
    (
      await f.save(
        { name: 'other', confirmation: again.confirmation },
        nextManifest.revision,
      )
    ).json().state,
  ).toBe('conflicts');
});

test('invalid requests cannot choose roots and pending, failed, empty and expired renders cannot save', async () => {
  const f = await fixture();
  expect((await f.save({ outputDirectory: f.root })).statusCode).toBe(400);
  expect((await f.save({ name: null })).statusCode).toBe(400);
  expect((await f.save({}, 'unknown-revision')).statusCode).toBe(409);
  const pending = f.render().then((r) => r);
  await new Promise((resolve) => setTimeout(resolve, 1));
  const concurrent = await f.save();
  expect([409, 503]).toContain(concurrent.statusCode);
  await pending;
  const empty = (
    await f.app.inject({
      method: 'POST',
      url: `/api/jobs/${f.job.id}/render`,
      payload: { crops: {}, oled: false, threshold: 16 },
    })
  ).json<Manifest>();
  expect((await f.save({}, empty.revision)).statusCode).toBe(409);
});

test.each(['file', 'device', 'root', 'directory'])(
  'refuses unsafe %s destinations without touching outside files',
  async (kind) => {
    const f = await fixture();
    const outside = join(f.root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'keep.png'), 'keep');
    const id = devices[0]!.id;
    if (kind === 'root') await symlink(outside, f.outputDirectory);
    else {
      await mkdir(f.outputDirectory);
      if (kind === 'device')
        await symlink(outside, join(f.outputDirectory, id));
      if (kind === 'file')
        await symlink(
          join(outside, 'keep.png'),
          join(f.outputDirectory, `wallpaper-${id}.png`),
        );
      if (kind === 'directory')
        await mkdir(join(f.outputDirectory, `wallpaper-${id}.png`));
    }
    expect(
      (await f.save({ organizeIntoDeviceFolders: kind === 'device' })).json()
        .state,
    ).toBe('failed');
    expect(await readFile(join(outside, 'keep.png'), 'utf8')).toBe('keep');
    expect(await readdir(outside)).toEqual(['keep.png']);
    expect(
      (await f.app.inject(`/api/jobs/${f.job.id}/zip/${f.manifest.revision}`))
        .statusCode,
    ).toBe(200);
  },
);

test('new conflicts require review before any files are written; partial failures identify saved and remaining files', async () => {
  const f = await fixture();
  const output = new ServerOutput(f.outputDirectory);
  const files = [
    { path: 'one.png', contents: Buffer.from('one') },
    { path: 'two.png', contents: Buffer.from('two') },
  ];
  await output.save('render', files);
  const review = await output.save('render', files);
  await writeFile(join(f.outputDirectory, 'two.png'), 'changed');
  expect((await output.save('render', files, review.confirmation)).state).toBe(
    'conflicts',
  );
  await rm(f.outputDirectory, { recursive: true });
  const partial = await output.save('new', [
    files[0]!,
    { path: `${'a'.repeat(300)}.png`, contents: Buffer.from('bad') },
  ]);
  // Preflight failure does not claim any outputs were saved.
  expect(partial.state).toBe('failed');
  expect(partial.failed.length).toBe(2);
  expect(partial.saved).toEqual([]);
});

test('failed renders invalidate saves and idle expiry cannot revive a save', async () => {
  const f = await fixture();
  const failure = vi
    .spyOn(imaging, 'renderImage')
    .mockRejectedValueOnce(new Error('render failed'));
  try {
    expect((await f.render()).statusCode).toBe(500);
  } finally {
    failure.mockRestore();
  }
  expect((await f.save()).statusCode).toBe(409);
  const manifest = (await f.render()).json<Manifest>();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60000);
  try {
    expect((await f.save({}, manifest.revision)).statusCode).toBe(404);
  } finally {
    clock.mockRestore();
  }
});
test.each(['ENOSPC', 'EACCES', 'EROFS'])(
  'write failure %s reports partial progress and permits recovery',
  async (code) => {
    const f = await fixture();
    class FailingOutput extends ServerOutput {
      count = 0;
      protected override async writeOutput(
        ...args: [
          import('node:fs/promises').FileHandle,
          string,
          string,
          Buffer,
          string | null,
        ]
      ) {
        if (++this.count === 2)
          throw Object.assign(new Error('sensitive filesystem details'), {
            code,
          });
        await super.writeOutput(...args);
      }
    }
    const output = new FailingOutput(f.outputDirectory);
    const files = ['one.png', 'two.png', 'three.png'].map((path) => ({
      path,
      contents: Buffer.from(path),
    }));
    const result = await output.save('render', files);
    expect(result.state).toBe('failed');
    expect(result.saved).toEqual(['one.png']);
    expect(result.failed.map((f) => f.path)).toEqual(['two.png', 'three.png']);
    expect(result.failed[0]!.message).toMatch(
      code === 'ENOSPC' ? /Free space/ : /permission/,
    );
    expect(result.failed[0]!.message).not.toContain('sensitive');
    expect(await readdir(f.outputDirectory)).toEqual(['one.png']);
    const review = await output.save('render', files);
    expect(review.state).toBe('conflicts');
    expect(
      (await output.save('render', files, review.confirmation)).state,
    ).toBe('saved');
  },
);

test('startup rejects destinations nested in scratch storage before cleanup can remove persistent output', async () => {
  const f = await fixture();
  await f.app.close();
  const outputDirectory = join(f.config.temporaryDirectory, 'wallslice-output');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'keep.png'), 'persistent');
  const app = buildApp({ ...f.config, outputDirectory });
  await expect(app.ready()).rejects.toThrow('non-nested');
  await app.close();
  expect(await readFile(join(outputDirectory, 'keep.png'), 'utf8')).toBe(
    'persistent',
  );
});

test('newly created conflicts require a new review before writing any other outputs', async () => {
  const f = await fixture();
  const output = new ServerOutput(f.outputDirectory);
  const files = ['one.png', 'two.png'].map((path) => ({
    path,
    contents: Buffer.from('replacement'),
  }));
  await mkdir(f.outputDirectory);
  await writeFile(join(f.outputDirectory, 'one.png'), 'one');
  const review = await output.save('render', files);
  expect(review.conflicts).toEqual(['one.png']);
  await writeFile(join(f.outputDirectory, 'two.png'), 'new conflict');
  const renewed = await output.save('render', files, review.confirmation);
  expect(renewed.state).toBe('conflicts');
  expect(renewed.conflicts).toEqual(['one.png', 'two.png']);
  expect(await readFile(join(f.outputDirectory, 'one.png'), 'utf8')).toBe(
    'one',
  );
  expect(await readFile(join(f.outputDirectory, 'two.png'), 'utf8')).toBe(
    'new conflict',
  );
});

test('later saves preserve old names and unselected-device outputs', async () => {
  const f = await fixture();
  const id = devices[1]!.id;
  const both = (
    await f.app.inject({
      method: 'POST',
      url: `/api/jobs/${f.job.id}/render`,
      payload: {
        crops: {
          [devices[0]!.id]: f.job.smart[devices[0]!.id],
          [id]: f.job.smart[id],
        },
        oled: false,
        threshold: 16,
      },
    })
  ).json<Manifest>();
  expect((await f.save({ name: 'old' }, both.revision)).json().state).toBe(
    'saved',
  );
  expect((await f.save({ name: 'new' }, both.revision)).json().state).toBe(
    'saved',
  );
  const unselected = await readFile(join(f.outputDirectory, `new-${id}.png`));
  const one = (await f.render()).json<Manifest>();
  const review = (
    await f.save({ name: 'new' }, one.revision)
  ).json<SaveResult>();
  expect(
    (
      await f.save(
        { name: 'new', confirmation: review.confirmation },
        one.revision,
      )
    ).json().state,
  ).toBe('saved');
  expect(await readFile(join(f.outputDirectory, `new-${id}.png`))).toEqual(
    unselected,
  );
  expect(
    (await readFile(join(f.outputDirectory, `old-${id}.png`))).length,
  ).toBeGreaterThan(0);
});
