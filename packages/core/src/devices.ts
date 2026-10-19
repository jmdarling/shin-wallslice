import type { Size } from './geometry.js';

export const DEVICE_CATEGORIES = [
  'phone',
  'tablet',
  'laptop',
  'desktop',
  'monitor',
  'other',
] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

/** A device record from the catalog (`devices/*.json`). */
export interface Device {
  id: string;
  name: string;
  brand: string;
  category: DeviceCategory;
  year?: number;
  /** Native panel pixels. Phones and tablets are portrait-natural. */
  resolution: Size;
  /** Used in both orientations; output is square. Defaults by category. */
  rotates?: boolean;
  aliases?: string[];
  /** Citation for the resolution (manufacturer spec page). */
  source?: string;
}

export const CUSTOM_SIZE_MIN = 16;
export const CUSTOM_SIZE_MAX = 16384;

/** Whether a device is used in both orientations, applying the category default. */
export function deviceRotates(device: Pick<Device, 'category' | 'rotates'>): boolean {
  return device.rotates ?? device.category === 'tablet';
}

/** Output pixel size: native resolution, or a square of the longest side for rotating devices. */
export function outputSizeFor(resolution: Size, rotates: boolean): Size {
  if (rotates) {
    const side = Math.max(resolution.width, resolution.height);
    return { width: side, height: side };
  }
  return { width: resolution.width, height: resolution.height };
}

export function deviceOutputSize(device: Device): Size {
  return outputSizeFor(device.resolution, deviceRotates(device));
}

/** A target selected for the current session: a catalog device or an ad-hoc custom size. */
export type TargetSpec =
  | { kind: 'device'; deviceId: string }
  | { kind: 'custom'; width: number; height: number; label?: string; rotates?: boolean };

/** A target resolved against the catalog. */
export interface ResolvedTarget {
  /** Stable key, used as the folder name for outputs. */
  key: string;
  label: string;
  /** Native resolution (before square expansion). */
  resolution: Size;
  rotates: boolean;
  outputSize: Size;
}

export function isValidCustomDimension(value: number): boolean {
  return Number.isInteger(value) && value >= CUSTOM_SIZE_MIN && value <= CUSTOM_SIZE_MAX;
}

export function customTargetKey(width: number, height: number, rotates: boolean): string {
  return `custom-${width}x${height}${rotates ? '-square' : ''}`;
}

/**
 * Resolve a target spec. Returns `undefined` for unknown devices or invalid custom sizes.
 */
export function resolveTarget(
  spec: TargetSpec,
  devicesById: ReadonlyMap<string, Device>,
): ResolvedTarget | undefined {
  if (spec.kind === 'device') {
    const device = devicesById.get(spec.deviceId);
    if (!device) return undefined;
    const rotates = deviceRotates(device);
    return {
      key: device.id,
      label: device.name,
      resolution: device.resolution,
      rotates,
      outputSize: outputSizeFor(device.resolution, rotates),
    };
  }
  if (!isValidCustomDimension(spec.width) || !isValidCustomDimension(spec.height)) {
    return undefined;
  }
  const rotates = spec.rotates ?? false;
  const resolution = { width: spec.width, height: spec.height };
  return {
    key: customTargetKey(spec.width, spec.height, rotates),
    label: spec.label?.trim() || `Custom ${spec.width}×${spec.height}`,
    resolution,
    rotates,
    outputSize: outputSizeFor(resolution, rotates),
  };
}
