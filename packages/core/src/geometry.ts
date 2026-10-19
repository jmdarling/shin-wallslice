/** Pixel dimensions. */
export interface Size {
  width: number;
  height: number;
}

/** Rectangle in source-image pixel coordinates (top-left origin). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rectangle in normalized coordinates, each component in [0, 1] relative to the source. */
export type NormRect = Rect;

/** Point in normalized coordinates, each component in [0, 1] relative to the source. */
export interface NormPoint {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Clamp a normalized rect so it lies fully inside [0, 1] × [0, 1]. */
export function clampNormRect(rect: NormRect): NormRect {
  const width = clamp01(rect.width);
  const height = clamp01(rect.height);
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  };
}

export function rectCenter(rect: Rect): NormPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
