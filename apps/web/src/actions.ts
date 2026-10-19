import { slugify, type RenderRequest } from '@shin-wallslice/core';
import { api, errorMessage, type DownloadedFile } from './api.js';
import {
  baseName,
  busy,
  config,
  cropOverrides,
  detectedSubject,
  devices,
  nameStatus,
  resetSourceState,
  selectedTargets,
  source,
  sourceStatus,
  subjectOverride,
  subjectStatus,
  toast,
  type SelectedTarget,
} from './state.js';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(kind: 'info' | 'error', message: string): void {
  toast.set({ kind, message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.set(undefined), kind === 'error' ? 8000 : 4000);
}

export async function loadInitial(): Promise<void> {
  try {
    const [appConfig, catalog] = await Promise.all([api.config(), api.devices()]);
    config.set(appConfig);
    devices.set(catalog.devices);
  } catch (error) {
    notify('error', `Could not load the app: ${errorMessage(error)}`);
  }
}

async function ingest(upload: () => ReturnType<typeof api.uploadFile>): Promise<void> {
  resetSourceState();
  sourceStatus.set('loading');
  try {
    const created = await upload();
    source.set(created);
    baseName.set(created.baseName);
    sourceStatus.set('ready');
    void loadSubject(created.id);
    if (config.get()?.namingEnabled) void suggestName();
  } catch (error) {
    sourceStatus.set('error');
    notify('error', errorMessage(error));
  }
}

export function uploadFile(file: File): Promise<void> {
  return ingest(() => api.uploadFile(file, file.name || 'pasted-image'));
}

export function uploadUrl(url: string): Promise<void> {
  return ingest(() => api.uploadUrl(url));
}

async function loadSubject(id: string): Promise<void> {
  subjectStatus.set('loading');
  try {
    const subject = await api.subject(id);
    if (source.get()?.id !== id) return;
    detectedSubject.set(subject);
    subjectStatus.set('ready');
  } catch (error) {
    if (source.get()?.id !== id) return;
    subjectStatus.set('error');
    notify('error', `Subject detection failed: ${errorMessage(error)}`);
  }
}

export async function suggestName(): Promise<void> {
  const current = source.get();
  if (!current) return;
  nameStatus.set('loading');
  try {
    const { name } = await api.suggestName(current.id);
    if (source.get()?.id !== current.id) return;
    baseName.set(name);
    nameStatus.set('ready');
  } catch (error) {
    nameStatus.set('error');
    notify('error', errorMessage(error));
  }
}

function renderRequest(targets: SelectedTarget[]): RenderRequest {
  const overrides = cropOverrides.get();
  const manual = subjectOverride.get();
  return {
    name: slugify(baseName.get() || source.get()?.baseName || 'wallpaper'),
    targets: targets.map(({ spec, resolved }) => {
      const override = overrides[resolved.key];
      return override ? { ...spec, override } : spec;
    }),
    ...(manual ? { subject: manual } : {}),
  };
}

function triggerDownload(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function withBusy(label: string, task: () => Promise<void>): Promise<void> {
  if (busy.get()) return;
  busy.set(label);
  try {
    await task();
  } catch (error) {
    notify('error', errorMessage(error));
  } finally {
    busy.set(undefined);
  }
}

export function downloadAll(): Promise<void> {
  const current = source.get();
  const targets = selectedTargets.get();
  if (!current || targets.length === 0) return Promise.resolve();
  return withBusy(targets.length === 1 ? 'Rendering…' : 'Building ZIP…', async () => {
    triggerDownload(await api.render(current.id, renderRequest(targets)));
  });
}

export function downloadOne(key: string): Promise<void> {
  const current = source.get();
  const target = selectedTargets.get().find((t) => t.resolved.key === key);
  if (!current || !target) return Promise.resolve();
  return withBusy('Rendering…', async () => {
    triggerDownload(await api.render(current.id, renderRequest([target])));
  });
}

export function saveToOutput(): Promise<void> {
  const current = source.get();
  const targets = selectedTargets.get();
  if (!current || targets.length === 0) return Promise.resolve();
  return withBusy('Saving…', async () => {
    const { files } = await api.save(current.id, renderRequest(targets));
    notify('info', `Saved ${files.length} wallpaper${files.length === 1 ? '' : 's'} to the output folder.`);
  });
}

export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Share rendered PNGs via the Web Share API (e.g. AirDrop, save to Photos). */
export function shareAll(): Promise<void> {
  const current = source.get();
  const targets = selectedTargets.get();
  if (!current || targets.length === 0) return Promise.resolve();
  return withBusy('Preparing to share…', async () => {
    const files: File[] = [];
    for (const target of targets) {
      const rendered = await api.render(current.id, renderRequest([target]));
      files.push(new File([rendered.blob], rendered.fileName, { type: 'image/png' }));
    }
    try {
      await navigator.share({ files });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    }
  });
}
