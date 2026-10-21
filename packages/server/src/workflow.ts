import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import type { FastifyInstance } from 'fastify';
import catalog from './devices.json' with { type: 'json' };
import type { RuntimeConfig } from './config.js';
import type {
  Device,
  Job,
  Manifest,
  Preferences,
  RenderSettings,
} from './protocol.js';
import { cropSize, renderImage, safeName, smartCrop } from './imaging.js';
import { AiConnection } from './ai.js';
import { detectSubject, subjectCrop } from './detection.js';
import type { DetectionStatus } from './protocol.js';
import { suggestName } from './naming.js';
import { ServerOutput } from './server-output.js';
import type { NamingStatus } from './protocol.js';

export const devices: Device[] = catalog;
for (const d of devices) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.id) ||
    !d.name ||
    !Number.isInteger(d.width) ||
    !Number.isInteger(d.height) ||
    Math.min(d.width, d.height) < 1 ||
    Math.max(d.width, d.height) > 16384 ||
    devices.filter((x) => x.id === d.id).length !== 1
  )
    throw new Error('Invalid bundled device catalog');
}
export const defaultPreferences: Preferences = {
  devices: devices.slice(0, 2).map((d) => d.id),
  method: 'smart',
  anchor: 'center',
  oled: false,
  threshold: 16,
  organizeIntoDeviceFolders: false,
};
function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
function preferences(value: unknown): Preferences {
  const p = value as Preferences | null;
  if (
    !p ||
    !Array.isArray(p.devices) ||
    p.devices.some((id) => !devices.some((d) => d.id === id)) ||
    new Set(p.devices).size !== p.devices.length ||
    !['smart', 'ai', 'entropy', 'anchor'].includes(p.method) ||
    ![
      'top-left',
      'top-right',
      'center',
      'bottom-left',
      'bottom-right',
    ].includes(p.anchor) ||
    typeof p.oled !== 'boolean' ||
    (p.organizeIntoDeviceFolders !== undefined &&
      typeof p.organizeIntoDeviceFolders !== 'boolean') ||
    !Number.isInteger(p.threshold) ||
    p.threshold < 0 ||
    p.threshold > 255
  )
    fail(
      'Invalid preferences. Choose valid devices, crop method, and a threshold from 0 to 255.',
    );
  return {
    devices: p.devices,
    method: p.method,
    anchor: p.anchor,
    oled: p.oled,
    threshold: p.threshold,
    organizeIntoDeviceFolders: p.organizeIntoDeviceFolders ?? false,
  };
}
interface StoredJob extends Job {
  naming: NamingStatus;
  detection: DetectionStatus;
  detectionController?: AbortController;
  aiImage?: Buffer;
  namingController?: AbortController;
  directory: string;
  touched: number;
  manifest?: Manifest;
}
export async function registerWorkflow(
  app: FastifyInstance,
  config: RuntimeConfig,
) {
  const connection = config.ai?.enabled
    ? new AiConnection(config.ai)
    : undefined;
  const namingFailure =
    'AI naming is unavailable. Check the service, credentials, and vision model, then retry. You can keep your current name and download now.';
  const startNaming = (job: StoredJob) => {
    if (!connection || job.namingController || job.naming.state === 'succeeded')
      return;
    if (!job.aiImage) {
      job.naming = { state: 'failed', message: namingFailure };
      return;
    }
    const controller = new AbortController();
    job.namingController = controller;
    job.naming = { state: 'pending' };
    void suggestName(connection, job.aiImage, controller.signal)
      .then((name) => {
        if (!controller.signal.aborted)
          job.naming = { state: 'succeeded', name };
      })
      .catch(() => {
        if (!controller.signal.aborted)
          job.naming = { state: 'failed', message: namingFailure };
      })
      .finally(() => {
        delete job.namingController;
      });
  };
  const startDetection = (job: StoredJob, retry = false) => {
    if (
      !connection ||
      job.detectionController ||
      job.detection.state === 'succeeded' ||
      job.detection.state === 'no-subject'
    )
      return;
    const failure = () => {
      job.detection = {
        state: 'failed',
        message:
          'AI subject detection is unavailable. Using entropy crops. You can continue or retry.',
      };
    };
    if (!job.aiImage && !retry) {
      failure();
      return;
    }
    const controller = new AbortController();
    job.detectionController = controller;
    job.detection = { state: 'pending' };
    void (async () => {
      if (!job.aiImage)
        job.aiImage = await exclusive(() =>
          prepareImage(join(job.directory, 'source.png')),
        );
      if (controller.signal.aborted) throw new Error('Cancelled');
      return detectSubject(connection, job.aiImage, controller.signal);
    })()
      .then((bounds) => {
        if (controller.signal.aborted) return;
        job.detection = bounds
          ? {
              state: 'succeeded',
              crops: Object.fromEntries(
                devices.map((d) => [
                  d.id,
                  subjectCrop(job.width, job.height, d, bounds),
                ]),
              ),
            }
          : { state: 'no-subject' };
      })
      .catch(() => {
        if (!controller.signal.aborted) failure();
      })
      .finally(() => {
        delete job.detectionController;
      });
  };
  const MiB = 1024 * 1024;
  const maxPixels = Math.floor(((config.memoryBudgetMiB - 768) * MiB) / 24);
  const uploadLimit = Math.floor((config.memoryBudgetMiB * MiB) / 4);
  if (devices.some((d) => d.width * d.height > maxPixels))
    throw new Error(
      'Bundled output dimensions exceed memoryBudgetMiB; increase the budget or reduce the preset dimensions',
    );
  const reservation =
    uploadLimit +
    maxPixels * 8 +
    devices.reduce((sum, d) => sum + d.width * d.height * 10, 0) +
    16 * MiB;
  if (reservation > config.temporaryStorageMiB * MiB)
    throw new Error(
      'temporaryStorageMiB is too small for the memory budget and bundled output catalog',
    );
  // Persistent outputs must never be swept as temporary jobs, including paths
  // whose existing ancestors are symlinks.
  if (config.outputDirectory) {
    const prospective = async (path: string): Promise<string> => {
      try {
        return await realpath(path);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          dirname(path) !== path
        )
          return join(await prospective(dirname(path)), basename(path));
        return path;
      }
    };
    const output = await prospective(resolve(config.outputDirectory));
    const temporary = await prospective(resolve(config.temporaryDirectory));
    if (
      output === temporary ||
      output.startsWith(temporary + sep) ||
      temporary.startsWith(output + sep)
    )
      throw new Error(
        'outputDirectory and temporaryDirectory must be separate, non-nested directories so saved wallpapers survive cleanup.',
      );
  }
  await mkdir(config.temporaryDirectory, { recursive: true });
  // This is a dedicated application-owned directory. Remove jobs left by a crash/restart.
  for (const entry of await readdir(config.temporaryDirectory))
    if (entry.startsWith('wallslice-'))
      await rm(join(config.temporaryDirectory, entry), {
        recursive: true,
        force: true,
      });
  const root = await mkdtemp(join(config.temporaryDirectory, 'wallslice-'));
  const jobs = new Map<string, StoredJob>();
  const serverOutput = config.outputDirectory
    ? new ServerOutput(config.outputDirectory)
    : undefined;
  let busy = false;
  let uploadOwner: string | undefined;
  const exclusive = async <T>(
    work: () => Promise<T>,
    owner?: string,
  ): Promise<T> => {
    if (busy || (uploadOwner && uploadOwner !== owner))
      fail('Image processing is busy. Please retry in a moment.', 503);
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  };
  const prepareImage = async (source: string) => {
    const image = await sharp(source, { limitInputPixels: maxPixels })
      .timeout({ seconds: 30 })
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (image.length > 2 * MiB)
      throw new Error('Image representation exceeds size limit');
    return image;
  };
  const discard = async (id: string) => {
    const j = jobs.get(id);
    if (j) {
      j.namingController?.abort();
      j.detectionController?.abort();
      jobs.delete(id);
      await rm(j.directory, { recursive: true, force: true });
    }
  };
  const sweep = async (force = false) => {
    if (busy && !force) return;
    for (const j of jobs.values())
      if (Date.now() - j.touched > config.jobTtlMinutes * 60000)
        await discard(j.id);
  };
  const timer = setInterval(() => {
    void sweep().catch((error) => app.log.error(error));
  }, 30000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    for (const job of jobs.values()) {
      job.namingController?.abort();
      job.detectionController?.abort();
    }
    await rm(root, { recursive: true, force: true });
  });
  const getJob = (id: string) => {
    const j = jobs.get(id);
    if (!j || Date.now() - j.touched > config.jobTtlMinutes * 60000) {
      j?.namingController?.abort();
      j?.detectionController?.abort();
      fail(
        'This temporary wallpaper expired. Start over and choose the image again.',
        404,
      );
    }
    j.touched = Date.now();
    return j;
  };
  let saved: Preferences = structuredClone(defaultPreferences);
  let preferenceError = '';
  const preferencePath = join(config.dataDirectory, 'preferences.json');
  try {
    saved = preferences(JSON.parse(await readFile(preferencePath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      preferenceError = `Could not read preferences: ${(error as Error).message}. Retry saving your preferences.`;
  }
  if (saved.method === 'smart' || (saved.method === 'ai' && !connection)) {
    saved.method = connection ? 'ai' : 'entropy';
    try {
      await mkdir(config.dataDirectory, { recursive: true });
      await writeFile(`${preferencePath}.tmp`, JSON.stringify(saved));
      await rename(`${preferencePath}.tmp`, preferencePath);
    } catch {
      preferenceError ||=
        'Could not save migrated preferences. Retry saving your preferences.';
    }
  }
  app.get('/api/catalog', async () => ({
    devices,
    aiEnabled: !!connection,
    serverSavingEnabled: !!serverOutput,
    preferences: saved,
    preferenceError,
    limits: { maxPixels, uploadBytes: uploadLimit },
  }));
  let saving = Promise.resolve();
  app.put('/api/preferences', async (request) => {
    const next = preferences(request.body);
    if (next.method === 'smart') next.method = connection ? 'ai' : 'entropy';
    if (next.method === 'ai' && !connection) next.method = 'entropy';
    const operation = saving
      .catch(() => {})
      .then(async () => {
        try {
          await mkdir(config.dataDirectory, { recursive: true });
          await writeFile(`${preferencePath}.tmp`, JSON.stringify(next));
          await rename(`${preferencePath}.tmp`, preferencePath);
          saved = next;
          preferenceError = '';
        } catch (error) {
          fail(
            `Could not save preferences. Check data-directory write permissions: ${(error as Error).message}`,
            500,
          );
        }
      });
    saving = operation;
    await operation;
    return saved;
  });
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    const message =
      status === 413
        ? `Image upload exceeds the configured ${Math.round(uploadLimit / MiB)} MiB memory allowance. Choose a smaller file.`
        : error instanceof Error
          ? error.message
          : 'Image request failed. Please retry.';
    if (status >= 500) app.log.error(error);
    void reply.code(status).send({ message });
  });
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: uploadLimit },
    (_req, body, done) => done(null, body),
  );
  app.post(
    '/api/jobs',
    {
      bodyLimit: uploadLimit,
      onRequest: async (request) => {
        if (busy || uploadOwner)
          fail('Image processing is busy. Please retry in a moment.', 503);
        uploadOwner = request.id;
      },
      onRequestAbort: async (request) => {
        if (uploadOwner === request.id) uploadOwner = undefined;
      },
      onResponse: async (request) => {
        if (uploadOwner === request.id) uploadOwner = undefined;
      },
    },
    async (request) =>
      exclusive(async () => {
        await sweep(true);
        if (
          jobs.size >=
          Math.min(
            config.maxJobs,
            Math.floor((config.temporaryStorageMiB * MiB) / reservation),
          )
        )
          fail(
            'Temporary storage is full. Start over in another open tab or wait for abandoned jobs to expire.',
            503,
          );
        if (!Buffer.isBuffer(request.body) || !request.body.length)
          fail('Choose one JPEG, PNG, or WebP image.');
        const id = randomUUID(),
          directory = join(root, id);
        await mkdir(directory);
        try {
          let meta;
          try {
            meta = await sharp(request.body, {
              limitInputPixels: maxPixels,
              failOn: 'warning',
            }).metadata();
          } catch {
            fail(
              `Cannot read this image. Choose a valid JPEG, PNG, or WebP within the decoded limit of ${maxPixels.toLocaleString()} pixels.`,
            );
          }
          if (
            !['jpeg', 'png', 'webp'].includes(meta.format) ||
            (meta.pages ?? 1) > 1
          )
            fail(
              'Choose one still JPEG, PNG, or WebP image; animated and other formats are unsupported.',
            );
          if (
            !meta.width ||
            !meta.height ||
            meta.width * meta.height > maxPixels
          )
            fail(
              'This image exceeds the configured decoded image memory budget. Choose a smaller image.',
            );
          const source = join(directory, 'source.png');
          try {
            await sharp(request.body, {
              limitInputPixels: maxPixels,
              failOn: 'warning',
            })
              .autoOrient()
              .toColourspace('srgb')
              .png()
              .toFile(source);
          } catch {
            fail(
              'The image is corrupt or could not be decoded. Try another JPEG, PNG, or WebP.',
            );
          }
          const normalized = await sharp(source).metadata();
          const job: StoredJob = {
            id,
            directory,
            naming: { state: connection ? 'pending' : 'disabled' },
            detection: { state: connection ? 'pending' : 'disabled' },
            width: normalized.width!,
            height: normalized.height!,
            smart: {},
            touched: Date.now(),
          };
          for (const d of devices)
            job.smart[d.id] = await smartCrop(source, job.width, job.height, d);
          if (connection) {
            try {
              job.aiImage = await prepareImage(source);
            } catch {
              /* AI preparation must never reject a valid local upload. */
            }
          }
          jobs.set(id, job);
          startNaming(job);
          startDetection(job);
          return {
            id,
            width: job.width,
            height: job.height,
            smart: job.smart,
            naming: job.naming,
            detection: job.detection,
          };
        } catch (error) {
          await rm(directory, { recursive: true, force: true });
          throw error;
        }
      }, request.id),
  );
  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/naming',
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return getJob(request.params.id).naming;
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/naming',
    async (request) => {
      const job = getJob(request.params.id);
      if (job.naming.state === 'failed') startNaming(job);
      return job.naming;
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/detection',
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return getJob(request.params.id).detection;
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/detection',
    async (request) => {
      const job = getJob(request.params.id);
      if (job.detection.state === 'failed') startDetection(job, true);
      return job.detection;
    },
  );
  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request) =>
    exclusive(async () => {
      await discard(request.params.id);
      return { ok: true };
    }),
  );
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/render',
    async (request) =>
      exclusive(async () => {
        const job = getJob(request.params.id);
        const settings = request.body as RenderSettings;
        if (
          !settings ||
          !settings.crops ||
          typeof settings.crops !== 'object' ||
          Array.isArray(settings.crops) ||
          typeof settings.oled !== 'boolean' ||
          !Number.isInteger(settings.threshold) ||
          settings.threshold < 0 ||
          settings.threshold > 255
        )
          fail('Invalid image settings.');
        const selected = Object.keys(settings.crops);
        if (selected.length > devices.length) fail('Invalid device selection.');
        for (const id of selected) {
          const device = devices.find((d) => d.id === id);
          if (!device) fail('Unknown device.');
          const c = settings.crops[id]!;
          const size = cropSize(job.width, job.height, device);
          if (
            !c ||
            ![c.left, c.top, c.width, c.height].every(Number.isInteger) ||
            c.width !== size.width ||
            c.height !== size.height ||
            c.left < 0 ||
            c.top < 0 ||
            c.left + c.width > job.width ||
            c.top + c.height > job.height
          )
            fail(
              'Crop must keep its original size and stay within the source image.',
            );
        }
        // Invalidate previous exports immediately; failed/pending generations can never serve stale files.
        delete job.manifest;
        for (const entry of await readdir(job.directory))
          if (entry !== 'source.png')
            await rm(join(job.directory, entry), {
              recursive: true,
              force: true,
            });
        const revision = randomUUID();
        const dir = join(job.directory, revision);
        await mkdir(dir);
        const prefix = `/api/jobs/${job.id}/files/${revision}`;
        const manifest: Manifest = {
          revision,
          source: `${prefix}/preview.png`,
          outputs: {},
        };
        try {
          await renderImage(
            join(job.directory, 'source.png'),
            join(dir, 'preview.png'),
            undefined,
            1600,
            1600,
            settings.oled,
            settings.threshold,
          );
          for (const id of selected) {
            const d = devices.find((d) => d.id === id)!;
            await renderImage(
              join(job.directory, 'source.png'),
              join(dir, `${id}.png`),
              settings.crops[id],
              d.width,
              d.height,
              settings.oled,
              settings.threshold,
            );
            manifest.outputs[id] = `${prefix}/${id}.png`;
          }
          job.manifest = manifest;
          job.touched = Date.now();
          return manifest;
        } catch (error) {
          await rm(dir, { recursive: true, force: true });
          app.log.error(error);
          fail(
            'Image generation failed. Retry processing; your source and positions are still available.',
            500,
          );
        }
      }),
  );
  app.post<{ Params: { id: string; revision: string } }>(
    '/api/jobs/:id/save/:revision',
    async (request) =>
      exclusive(async () => {
        if (!serverOutput) fail('Server saving is not configured.', 404);
        const body = request.body as Record<string, unknown> | null;
        if (
          !body ||
          Array.isArray(body) ||
          typeof body.name !== 'string' ||
          typeof body.organizeIntoDeviceFolders !== 'boolean' ||
          (body.confirmation !== undefined &&
            typeof body.confirmation !== 'string') ||
          Object.keys(body).some(
            (key) =>
              !['name', 'organizeIntoDeviceFolders', 'confirmation'].includes(
                key,
              ),
          )
        )
          fail(
            'Supply only a wallpaper name, folder choice, and optional replacement confirmation.',
          );
        const job = getJob(request.params.id),
          m = job.manifest;
        if (
          !m ||
          m.revision !== request.params.revision ||
          !Object.keys(m.outputs).length
        )
          fail('Generate current downloads before saving to the server.', 409);
        const name = safeName(body.name as string);
        const folders = body.organizeIntoDeviceFolders as boolean;
        const files = await Promise.all(
          Object.keys(m.outputs).map(async (id) => ({
            path: folders ? `${id}/${name}.png` : `${name}-${id}.png`,
            contents: await readFile(
              join(job.directory, m.revision, `${id}.png`),
            ),
          })),
        );
        return serverOutput.save(
          JSON.stringify([job.id, m.revision, name, folders]),
          files,
          body.confirmation as string | undefined,
        );
      }),
  );
  app.get<{
    Params: { id: string; revision: string; file: string };
    Querystring: { name?: string };
  }>('/api/jobs/:id/files/:revision/:file', async (request, reply) => {
    const job = getJob(request.params.id),
      m = job.manifest;
    if (!m || m.revision !== request.params.revision)
      fail(
        'These outputs are no longer current. Generate downloads again.',
        409,
      );
    const file = request.params.file;
    if (
      file !== 'preview.png' &&
      !Object.keys(m.outputs).some((id) => `${id}.png` === file)
    )
      fail('Output not found.', 404);
    reply.header('Cache-Control', 'no-store');
    if (request.query.name)
      reply.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(safeName(request.query.name))}`,
      );
    return reply
      .type('image/png')
      .send(createReadStream(join(job.directory, m.revision, file)));
  });
  app.get<{
    Params: { id: string; revision: string };
    Querystring: { name?: string; organizeIntoDeviceFolders?: string };
  }>('/api/jobs/:id/zip/:revision', async (request, reply) =>
    exclusive(async () => {
      const job = getJob(request.params.id),
        m = job.manifest;
      if (
        !m ||
        m.revision !== request.params.revision ||
        !Object.keys(m.outputs).length
      )
        fail('Generate current downloads before downloading the archive.', 409);
      const name = safeName(request.query.name ?? 'wallpaper');
      const folders = request.query.organizeIntoDeviceFolders === 'true';
      const writer = new ZipWriter(new Uint8ArrayWriter(), { level: 0 });
      for (const id of Object.keys(m.outputs))
        await writer.add(
          folders ? `${id}/${name}.png` : `${name}-${id}.png`,
          new Uint8ArrayReader(
            await readFile(join(job.directory, m.revision, `${id}.png`)),
          ),
        );
      const data = await writer.close();
      reply
        .header('Cache-Control', 'no-store')
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
        );
      return reply.type('application/zip').send(Buffer.from(data));
    }),
  );
}
