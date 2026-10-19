import { clamp, type NormPoint, type Rect, type Size } from './geometry.js';
import type { Subject } from './subject.js';

/** Per-target manual adjustment. Both fields are optional. */
export interface CropOverride {
  /** Desired crop center in normalized source coordinates. */
  center?: NormPoint;
  /** Fraction of the base (largest) crop to keep, in (0, 1]. 1 = no zoom. */
  zoom?: number;
}

export interface CropResult {
  /** Integer crop rectangle in source pixels. */
  rect: Rect;
  /** Exact pixel size to resize the crop to. */
  outputSize: Size;
  /** Scale factor from crop to output; > 1 means upscaling. */
  scale: number;
  /** True when the output must be upscaled noticeably (see UPSCALE_WARNING_THRESHOLD). */
  upscaled: boolean;
  /** True when the subject box could not fit inside the crop on at least one axis. */
  subjectClipped: boolean;
}

/** Upscaling below this factor is visually negligible and not flagged. */
export const UPSCALE_WARNING_THRESHOLD = 1.01;

export const MIN_ZOOM = 0.1;

/** How far (0–1) to pull the crop center from the subject box center toward the focal point. */
const FOCAL_BIAS = 0.5;

/** Largest rect with the output's aspect ratio that fits in the source (cover fit). */
export function baseCropSize(source: Size, output: Size): Size {
  const targetAspect = output.width / output.height;
  const sourceAspect = source.width / source.height;
  if (sourceAspect > targetAspect) {
    return { width: source.height * targetAspect, height: source.height };
  }
  return { width: source.width, height: source.width / targetAspect };
}

/**
 * Choose the crop center along one axis.
 *
 * When the subject fits, the center is pulled toward the focal point but constrained so that the
 * whole subject stays in frame. When it doesn't fit, the crop centers on the focal point.
 */
function axisCenter(
  boxStart: number,
  boxLength: number,
  focal: number,
  cropLength: number,
): { center: number; clipped: boolean } {
  const boxCenter = boxStart + boxLength / 2;
  if (boxLength <= cropLength) {
    const desired = boxCenter + (focal - boxCenter) * FOCAL_BIAS;
    const min = boxStart + boxLength - cropLength / 2;
    const max = boxStart + cropLength / 2;
    return { center: clamp(desired, min, max), clipped: false };
  }
  return { center: focal, clipped: true };
}

/**
 * Compute the crop for one target. Pure and deterministic: used by the browser for live previews
 * and by the server for the final export, so both always agree.
 */
export function computeCrop(
  source: Size,
  subject: Pick<Subject, 'box' | 'focal'>,
  output: Size,
  override: CropOverride = {},
): CropResult {
  const base = baseCropSize(source, output);
  const zoom = clamp(override.zoom ?? 1, MIN_ZOOM, 1);
  const cropWidth = base.width * zoom;
  const cropHeight = base.height * zoom;

  let centerX: number;
  let centerY: number;
  let subjectClipped = false;

  if (override.center) {
    centerX = override.center.x * source.width;
    centerY = override.center.y * source.height;
  } else {
    const box = {
      x: subject.box.x * source.width,
      y: subject.box.y * source.height,
      width: subject.box.width * source.width,
      height: subject.box.height * source.height,
    };
    const horizontal = axisCenter(box.x, box.width, subject.focal.x * source.width, cropWidth);
    const vertical = axisCenter(box.y, box.height, subject.focal.y * source.height, cropHeight);
    centerX = horizontal.center;
    centerY = vertical.center;
    subjectClipped = horizontal.clipped || vertical.clipped;
  }

  const width = clamp(Math.round(cropWidth), 1, source.width);
  const height = clamp(Math.round(cropHeight), 1, source.height);
  const x = clamp(Math.round(centerX - width / 2), 0, source.width - width);
  const y = clamp(Math.round(centerY - height / 2), 0, source.height - height);

  const scale = Math.max(output.width / width, output.height / height);
  return {
    rect: { x, y, width, height },
    outputSize: { width: output.width, height: output.height },
    scale,
    upscaled: scale > UPSCALE_WARNING_THRESHOLD,
    subjectClipped,
  };
}
