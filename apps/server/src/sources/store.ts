import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Size, Subject } from '@shin-wallslice/core';
import { notFound } from '../errors.js';

export interface SourceMeta {
  id: string;
  size: Size;
  format: string;
  baseName: string;
  proxySize: Size;
  createdAt: string;
}

const ID_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * Ephemeral, file-backed store for uploaded sources and derived artifacts.
 * Layout: <dataDir>/sources/<id>/{original, proxy.jpg, meta.json, subject.json}
 * Nothing here is user configuration; everything expires after the TTL.
 */
export class SourceStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(dataDir, 'sources');
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  newId(): string {
    return randomUUID();
  }

  dir(id: string): string {
    if (!ID_PATTERN.test(id)) throw notFound('source_not_found', 'Unknown source.');
    return join(this.root, id);
  }

  originalPath(id: string): string {
    return join(this.dir(id), 'original');
  }

  proxyPath(id: string): string {
    return join(this.dir(id), 'proxy.jpg');
  }

  async create(id: string, original: Buffer): Promise<void> {
    await mkdir(this.dir(id), { recursive: true });
    await writeFile(this.originalPath(id), original);
  }

  async writeProxy(id: string, proxy: Buffer): Promise<void> {
    await writeFile(this.proxyPath(id), proxy);
  }

  async writeMeta(meta: SourceMeta): Promise<void> {
    await writeFile(join(this.dir(meta.id), 'meta.json'), JSON.stringify(meta));
  }

  async readMeta(id: string): Promise<SourceMeta> {
    try {
      return JSON.parse(await readFile(join(this.dir(id), 'meta.json'), 'utf8')) as SourceMeta;
    } catch {
      throw notFound('source_not_found', 'Unknown or expired source. Please add the image again.');
    }
  }

  async readSubject(id: string): Promise<Subject | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir(id), 'subject.json'), 'utf8')) as Subject;
    } catch {
      return undefined;
    }
  }

  async writeSubject(id: string, subject: Subject): Promise<void> {
    await writeFile(join(this.dir(id), 'subject.json'), JSON.stringify(subject));
  }

  async remove(id: string): Promise<void> {
    await rm(this.dir(id), { recursive: true, force: true });
  }

  /** Delete sources older than the TTL. Returns how many were removed. */
  async sweep(ttlMs: number): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    for (const entry of await readdir(this.root).catch(() => [])) {
      const path = join(this.root, entry);
      const info = await stat(path).catch(() => undefined);
      if (info && info.mtimeMs < cutoff) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }
}
