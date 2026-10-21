import { constants } from 'node:fs';
import {
  open,
  mkdir,
  lstat,
  realpath,
  link,
  unlink,
  rename,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import type { SaveResult } from './protocol.js';

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';
const fingerprint = async (path: string): Promise<string | null> => {
  try {
    const s = await lstat(path, { bigint: true });
    if (!s.isFile() || s.nlink !== 1n)
      throw new Error(
        'Destination is a symbolic link, directory, special file, or hard link. Move it aside and retry.',
      );
    return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
};
const explain = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOSPC' || code === 'EDQUOT')
    return 'Destination storage is full. Free space and retry.';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
    return 'Destination is not writable. Grant the application user write/traverse permission or mount it read-write, then retry.';
  if (code)
    return 'Destination is unavailable or changed. Check the mount, directories, and write permissions, then retry.';
  return (error as Error).message;
};

type DirectoryOperation =
  | { kind: 'mkdir'; name: string }
  | { kind: 'write'; name: string; contents: string; expected: string | null };

// A subprocess's working directory pins the actual directory on POSIX hosts
// without /proc. Validate its inode before doing anything, then use relative
// names exclusively. A parent-path symlink swap cannot redirect those writes.
export async function directoryOperation(
  device: string,
  inode: string,
  operation: DirectoryOperation,
) {
  const directory = await lstat('.', { bigint: true });
  if (String(directory.dev) !== device || String(directory.ino) !== inode)
    throw new Error('Destination directory changed. Retry saving.');
  if (operation.kind === 'mkdir') {
    await mkdir(operation.name, { recursive: true });
    const child = await open(
      operation.name,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await child.stat({ bigint: true });
      return { device: String(stat.dev), inode: String(stat.ino) };
    } finally {
      await child.close();
    }
  }
  await commitFile(
    operation.name,
    Buffer.from(operation.contents, 'base64'),
    operation.expected,
  );
}

async function inDirectory(
  handle: FileHandle,
  path: string,
  operation: DirectoryOperation,
) {
  const stat = await handle.stat({ bigint: true });
  const script = `import { directoryOperation } from ${JSON.stringify(import.meta.url)}; let input=''; for await (const chunk of process.stdin) input+=chunk; try { const a=JSON.parse(input); const result=await directoryOperation(a.device,a.inode,a.operation); console.log(JSON.stringify(result ?? {})); } catch(e) { console.log(JSON.stringify({message:e.message,code:e.code})); process.exitCode=1; }`;
  return new Promise<{ device?: string; inode?: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: path, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.on('close', (code) => {
      if (code === 0)
        resolve(JSON.parse(output) as { device?: string; inode?: string });
      else {
        try {
          const error = JSON.parse(output) as {
            message: string;
            code?: string;
          };
          reject(Object.assign(new Error(error.message), { code: error.code }));
        } catch {
          reject(
            new Error(
              'Destination operation failed. Check the directory and retry.',
            ),
          );
        }
      }
    });
    child.stdin.end(
      JSON.stringify({
        device: String(stat.dev),
        inode: String(stat.ino),
        operation,
      }),
    );
  });
}

async function commitFile(
  target: string,
  contents: Buffer,
  expected: string | null,
) {
  let temporary: string | undefined;
  try {
    if ((await fingerprint(target)) !== expected)
      throw new Error(
        'Destination changed after review. Retry saving to review conflicts again.',
      );
    temporary = join(dirname(target), `.wallslice-${randomUUID()}.tmp`);
    const output = await open(temporary, 'wx', 0o644);
    try {
      await output.writeFile(contents);
      await output.sync();
    } finally {
      await output.close();
    }
    if ((await fingerprint(target)) !== expected)
      throw new Error(
        'Destination changed after review. Retry saving to review conflicts again.',
      );
    if (expected === null) await link(temporary, target);
    else await rename(temporary, target);
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

// Linux uses open directory descriptors for every write so renaming a parent or
// replacing it with a symlink cannot redirect a write. Other local Node hosts
// pin the working directory in a subprocess before writing.
export class ServerOutput {
  readonly destination: string;
  private secret = randomUUID();
  constructor(directory: string) {
    this.destination = resolve(directory);
  }
  protected async writeOutput(
    parent: FileHandle,
    directory: string,
    target: string,
    contents: Buffer,
    expected: string | null,
  ) {
    if (process.platform !== 'linux')
      await inDirectory(parent, directory, {
        kind: 'write',
        name: basename(target),
        contents: contents.toString('base64'),
        expected,
      });
    else await commitFile(target, contents, expected);
  }

  async save(
    binding: string,
    files: { path: string; contents: Buffer }[],
    confirmation?: string,
  ): Promise<SaveResult> {
    const saved: string[] = [];
    const handles: FileHandle[] = [];
    const parents = new Map<
      string,
      { path: string; canonical: string; handle: FileHandle }
    >();
    try {
      await mkdir(this.destination, { recursive: true });
      const initialRoot = await lstat(this.destination);
      if (initialRoot.isSymbolicLink())
        throw new Error(
          'Output directory must not be a symbolic link. Configure a real directory.',
        );
      const canonicalRoot = await realpath(this.destination);
      const root = await open(
        canonicalRoot,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      handles.push(root);
      const pinnedRoot = await root.stat();
      if (
        initialRoot.ino !== pinnedRoot.ino ||
        initialRoot.dev !== pinnedRoot.dev
      )
        throw new Error('Output directory changed. Retry saving.');
      const anchored = (handle: FileHandle, fallback: string) =>
        process.platform === 'linux' ? `/proc/self/fd/${handle.fd}` : fallback;
      parents.set('', {
        path: anchored(root, canonicalRoot),
        canonical: canonicalRoot,
        handle: root,
      });
      for (const file of files) {
        if (
          !/^(?:[a-z0-9-]+\/)?[^/\\]+\.png$/u.test(file.path) ||
          basename(file.path).startsWith('.')
        )
          throw new Error('Unsafe output filename.');
        const folder = dirname(file.path) === '.' ? '' : dirname(file.path);
        if (!parents.has(folder)) {
          const path = join(anchored(root, canonicalRoot), folder);
          let identity: { device?: string; inode?: string } | undefined;
          if (process.platform === 'linux')
            await mkdir(path, { recursive: true });
          else
            identity = await inDirectory(root, canonicalRoot, {
              kind: 'mkdir',
              name: folder,
            });
          const handle = await open(
            path,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          );
          handles.push(handle);
          if (identity) {
            const stat = await handle.stat({ bigint: true });
            if (
              String(stat.dev) !== identity.device ||
              String(stat.ino) !== identity.inode
            )
              throw new Error('Destination directory changed. Retry saving.');
          }
          parents.set(folder, {
            path: anchored(handle, path),
            canonical: join(canonicalRoot, folder),
            handle,
          });
        }
      }
      const targets = files.map((file) => {
        const folder = dirname(file.path) === '.' ? '' : dirname(file.path);
        return {
          ...file,
          parent: parents.get(folder)!,
          target: join(parents.get(folder)!.path, basename(file.path)),
        };
      });
      const state = await Promise.all(
        targets.map((file) => fingerprint(file.target)),
      );
      const conflicts = targets
        .filter((_, i) => state[i] !== null)
        .map((file) => file.path);
      const token = createHmac('sha256', this.secret)
        .update(
          JSON.stringify([
            binding,
            canonicalRoot,
            files.map((f) => f.path),
            state,
          ]),
        )
        .digest('hex');
      if (conflicts.length && confirmation !== token)
        return {
          state: 'conflicts',
          destination: this.destination,
          saved,
          conflicts,
          confirmation: token,
          failed: [],
        };
      // Inspect all destinations before any PNG is written, including replacements.
      for (const [i, file] of targets.entries()) {
        try {
          await this.writeOutput(
            file.parent.handle,
            file.parent.canonical,
            file.target,
            file.contents,
            state[i]!,
          );
          saved.push(file.path);
        } catch (error) {
          return {
            state: 'failed',
            destination: this.destination,
            saved,
            conflicts: [],
            failed: targets.slice(i).map((f, n) => ({
              path: f.path,
              message:
                n === 0 ? explain(error) : 'Not attempted. Retry saving.',
            })),
          };
        }
      }
      return {
        state: 'saved',
        destination: this.destination,
        saved,
        conflicts: [],
        failed: [],
      };
    } catch (error) {
      return {
        state: 'failed',
        destination: this.destination,
        saved,
        conflicts: [],
        failed: files
          .filter((f) => !saved.includes(f.path))
          .map((f) => ({ path: f.path, message: explain(error) })),
      };
    } finally {
      await Promise.all(handles.map((handle) => handle.close()));
    }
  }
}
