import { constants } from 'node:fs';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import yazl from 'yazl';
import {
  baseNameFromFilename,
  computeCrop,
  resolveTarget,
  slugify,
  type CropResult,
  type ResolvedTarget,
  type Subject,
  type SubjectOverride,
  type TargetRequest,
} from '@shin-wallslice/core';
import type { Catalog } from './catalog.js';
import type { SubjectDetector } from './detection/types.js';
import { badRequest, unavailable } from './errors.js';
import { probeImage, renderCrop, renderNamingThumbnail, renderProxy } from './image/sharp-io.js';
import type { Limiter } from './limiter.js';
import type { NameSuggester } from './naming/index.js';
import type { SourceMeta, SourceStore } from './sources/store.js';

export interface PlannedTarget {
  target: ResolvedTarget;
  crop: CropResult;
}

export interface PipelineDeps {
  store: SourceStore;
  catalog: Catalog;
  detector: SubjectDetector;
  namer: NameSuggester | undefined;
  limiter: Limiter;
  maxInputMegapixels: number;
  outputDir: string;
  logger: { warn(message: string): void };
}

export const MAX_TARGETS_PER_REQUEST = 64;

/**
 * The wallpaper pipeline: ingest → detect → plan crops → render / zip / save.
 * Independent of HTTP so a future CLI or watch mode can drive it directly.
 */
export class Pipeline {
  private readonly detections = new Map<string, Promise<Subject>>();

  constructor(private readonly deps: PipelineDeps) {}

  /** Validate, store and preview a new source. Subject detection starts in the background. */
  async ingest(buffer: Buffer, nameHint: string): Promise<SourceMeta> {
    const { store, limiter, maxInputMegapixels } = this.deps;
    const probed = await limiter.run(() => probeImage(buffer, maxInputMegapixels));
    const id = store.newId();
    await store.create(id, buffer);
    try {
      const proxy = await limiter.run(() => renderProxy(store.originalPath(id), maxInputMegapixels));
      await store.writeProxy(id, proxy.buffer);
      const meta: SourceMeta = {
        id,
        size: probed.size,
        format: probed.format,
        baseName: baseNameFromFilename(nameHint),
        proxySize: proxy.size,
        createdAt: new Date().toISOString(),
      };
      await store.writeMeta(meta);
      void this.subject(id).catch(() => undefined);
      return meta;
    } catch (error) {
      await store.remove(id);
      throw error;
    }
  }

  /** Detected subject for a source; computed once and cached on disk. */
  subject(id: string): Promise<Subject> {
    const inFlight = this.detections.get(id);
    if (inFlight) return inFlight;
    const promise = (async () => {
      const { store, limiter, detector } = this.deps;
      const cached = await store.readSubject(id);
      if (cached) return cached;
      await store.readMeta(id); // 404 for unknown sources
      const subject = await limiter.run(() => detector.detect(store.originalPath(id)));
      await store.writeSubject(id, subject);
      return subject;
    })().finally(() => this.detections.delete(id));
    this.detections.set(id, promise);
    return promise;
  }

  /** Resolve targets and compute crops. The server always recomputes crops from scratch. */
  async plan(
    id: string,
    targets: TargetRequest[],
    subjectOverride: SubjectOverride | undefined,
  ): Promise<{ meta: SourceMeta; planned: PlannedTarget[] }> {
    if (targets.length === 0) throw badRequest('no_targets', 'Select at least one device.');
    if (targets.length > MAX_TARGETS_PER_REQUEST) {
      throw badRequest('too_many_targets', `At most ${MAX_TARGETS_PER_REQUEST} targets per request.`);
    }
    const meta = await this.deps.store.readMeta(id);
    const subject = subjectOverride ?? (await this.subject(id));
    const seen = new Set<string>();
    const planned: PlannedTarget[] = [];
    for (const request of targets) {
      const target = resolveTarget(request, this.deps.catalog.byId);
      if (!target) throw badRequest('invalid_target', 'Unknown device or invalid custom size.');
      if (seen.has(target.key)) continue;
      seen.add(target.key);
      planned.push({ target, crop: computeCrop(meta.size, subject, target.outputSize, request.override) });
    }
    return { meta, planned };
  }

  render(id: string, planned: PlannedTarget): Promise<Buffer> {
    const { store, limiter, maxInputMegapixels } = this.deps;
    return limiter.run(() =>
      renderCrop(store.originalPath(id), maxInputMegapixels, planned.crop.rect, planned.crop.outputSize),
    );
  }

  /** Render all targets into a ZIP laid out as `<target>/<name>.png`. PNGs are stored, not deflated. */
  async zip(id: string, planned: PlannedTarget[], name: string): Promise<Readable> {
    const fileName = `${slugify(name)}.png`;
    const zip = new yazl.ZipFile();
    for (const item of planned) {
      zip.addBuffer(await this.render(id, item), `${item.target.key}/${fileName}`, { compress: false });
    }
    zip.end();
    return zip.outputStream as Readable;
  }

  async outputAvailable(): Promise<boolean> {
    try {
      await access(this.deps.outputDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Write `<output>/<target>/<name>.png`, overwriting existing files (by design). */
  async save(id: string, planned: PlannedTarget[], name: string): Promise<string[]> {
    if (!(await this.outputAvailable())) {
      throw unavailable('output_unavailable', 'The output folder is not mounted or not writable.');
    }
    const root = resolve(this.deps.outputDir);
    const fileName = `${slugify(name)}.png`;
    const written: string[] = [];
    for (const item of planned) {
      const directory = resolve(root, item.target.key);
      const path = join(directory, fileName);
      if (!path.startsWith(root + sep)) throw badRequest('invalid_name', 'Invalid output path.');
      const png = await this.render(id, item);
      await mkdir(directory, { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, png);
      await rename(temporary, path);
      written.push(relative(root, path));
    }
    return written;
  }

  async suggestName(id: string): Promise<string> {
    const { namer, store, maxInputMegapixels, logger } = this.deps;
    if (!namer) throw unavailable('naming_disabled', 'AI naming is not configured.');
    await store.readMeta(id);
    const thumbnail = await renderNamingThumbnail(store.originalPath(id), maxInputMegapixels);
    try {
      const suggestion = await namer.suggest(thumbnail);
      if (!suggestion) throw unavailable('naming_declined', 'The model did not suggest a name.');
      return slugify(suggestion);
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) throw error;
      logger.warn(`Name suggestion failed (${namer.provider}): ${(error as Error).message}`);
      throw unavailable('naming_failed', 'Name suggestion failed. You can still type a name.');
    }
  }
}
