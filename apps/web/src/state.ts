import { computed, signal } from '@lit-labs/signals';
import {
  resolveTarget,
  type AppConfigResponse,
  type CropOverride,
  type Device,
  type ResolvedTarget,
  type SourceResponse,
  type Subject,
  type SubjectOverride,
  type TargetSpec,
} from '@shin-wallslice/core';
import { load, save } from './storage.js';

export type Theme = 'system' | 'light' | 'dark';
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SelectedTarget {
  spec: TargetSpec;
  resolved: ResolvedTarget;
}

// --- App-wide state (signals) ---------------------------------------------

export const config = signal<AppConfigResponse | undefined>(undefined);
export const devices = signal<Device[]>([]);
export const devicesById = computed(() => new Map(devices.get().map((d) => [d.id, d])));

export const source = signal<SourceResponse | undefined>(undefined);
export const sourceStatus = signal<LoadStatus>('idle');

export const detectedSubject = signal<Subject | undefined>(undefined);
export const subjectStatus = signal<LoadStatus>('idle');
/** Global manual subject (box + focal). Applies to every target. */
export const subjectOverride = signal<SubjectOverride | undefined>(undefined);
export const effectiveSubject = computed<Subject | undefined>(() => {
  const manual = subjectOverride.get();
  if (manual) return { ...manual, confidence: 1, method: 'manual' };
  return detectedSubject.get();
});

/** Selected target specs, persisted so the next session starts with the same devices. */
export const targetSpecs = signal<TargetSpec[]>(load('targets', [], isTargetSpecArray));
export const selectedTargets = computed<SelectedTarget[]>(() => {
  const byId = devicesById.get();
  const result: SelectedTarget[] = [];
  const seen = new Set<string>();
  for (const spec of targetSpecs.get()) {
    const resolved = resolveTarget(spec, byId);
    if (!resolved || seen.has(resolved.key)) continue;
    seen.add(resolved.key);
    result.push({ spec, resolved });
  }
  return result;
});

/** Per-target manual crop adjustments, keyed by target key. Session only. */
export const cropOverrides = signal<Record<string, CropOverride>>({});

export const baseName = signal('');
export const nameStatus = signal<LoadStatus>('idle');

export const busy = signal<string | undefined>(undefined);
export const toast = signal<{ kind: 'info' | 'error'; message: string } | undefined>(undefined);

export const showGuides = signal<boolean>(load('showGuides', true, isBoolean));
export const theme = signal<Theme>(load('theme', 'system', isTheme));

// --- Mutations ----------------------------------------------------------------

export function setTargetSpecs(specs: TargetSpec[]): void {
  targetSpecs.set(specs);
  save('targets', specs);
}

export function toggleDevice(deviceId: string, selected: boolean): void {
  const others = targetSpecs.get().filter((s) => !(s.kind === 'device' && s.deviceId === deviceId));
  setTargetSpecs(selected ? [...others, { kind: 'device', deviceId }] : others);
}

export function addCustomTarget(spec: Extract<TargetSpec, { kind: 'custom' }>): void {
  setTargetSpecs([...targetSpecs.get(), spec]);
}

export function removeTarget(key: string): void {
  const byId = devicesById.get();
  setTargetSpecs(targetSpecs.get().filter((spec) => resolveTarget(spec, byId)?.key !== key));
  clearCropOverride(key);
}

export function setCropOverride(key: string, override: CropOverride): void {
  cropOverrides.set({ ...cropOverrides.get(), [key]: override });
}

export function clearCropOverride(key: string): void {
  const { [key]: _removed, ...rest } = cropOverrides.get();
  cropOverrides.set(rest);
}

export function setShowGuides(value: boolean): void {
  showGuides.set(value);
  save('showGuides', value);
}

export function setTheme(value: Theme): void {
  theme.set(value);
  save('theme', value);
  applyTheme(value);
}

export function applyTheme(value: Theme): void {
  if (value === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = value;
}

/** Reset everything tied to the current source. */
export function resetSourceState(): void {
  source.set(undefined);
  detectedSubject.set(undefined);
  subjectStatus.set('idle');
  subjectOverride.set(undefined);
  cropOverrides.set({});
  baseName.set('');
  nameStatus.set('idle');
}

// --- Validation of persisted values ------------------------------------------

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isTargetSpecArray(value: unknown): value is TargetSpec[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const spec = item as Record<string, unknown>;
      if (spec.kind === 'device') return typeof spec.deviceId === 'string';
      return (
        spec.kind === 'custom' && typeof spec.width === 'number' && typeof spec.height === 'number'
      );
    })
  );
}
