import { clampNormRect, type NormRect, type Subject } from '@shin-wallslice/core';
import type { Face, SaliencyResult } from './types.js';

/** Faces mark the head; expand them so hair and shoulders stay in frame. */
const FACE_EXPANSION = 1.6;
/** How strongly faces pull the focal point compared with the saliency centroid. */
const FACE_FOCAL_WEIGHT = 0.6;

function union(a: NormRect, b: NormRect): NormRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function expand(box: NormRect, factor: number): NormRect {
  const width = box.width * factor;
  const height = box.height * factor;
  return clampNormRect({
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  });
}

/**
 * Combine saliency and face detections into one subject.
 * Faces are always included in the subject box and bias the focal point toward them.
 * Returns undefined when neither signal found anything.
 */
export function fuseSubject(saliency: SaliencyResult | undefined, faces: Face[]): Subject | undefined {
  if (faces.length === 0) {
    return saliency ? { ...saliency, method: 'saliency' } : undefined;
  }

  const faceBoxes = faces.map((face) => expand(face.box, FACE_EXPANSION));
  const faceUnion = faceBoxes.reduce(union);
  const totalArea = faces.reduce((sum, face) => sum + face.box.width * face.box.height, 0);
  const faceFocal = {
    x: faces.reduce((sum, f) => sum + (f.box.x + f.box.width / 2) * f.box.width * f.box.height, 0) / totalArea,
    y: faces.reduce((sum, f) => sum + (f.box.y + f.box.height / 2) * f.box.width * f.box.height, 0) / totalArea,
  };
  const bestFace = Math.max(...faces.map((face) => face.score));

  if (!saliency) {
    return { box: faceUnion, focal: faceFocal, confidence: bestFace * 0.8, method: 'faces' };
  }

  return {
    box: clampNormRect(union(saliency.box, faceUnion)),
    focal: {
      x: faceFocal.x * FACE_FOCAL_WEIGHT + saliency.focal.x * (1 - FACE_FOCAL_WEIGHT),
      y: faceFocal.y * FACE_FOCAL_WEIGHT + saliency.focal.y * (1 - FACE_FOCAL_WEIGHT),
    },
    confidence: Math.max(saliency.confidence, bestFace),
    method: 'saliency',
  };
}
