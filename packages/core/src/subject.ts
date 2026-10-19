import type { NormPoint, NormRect } from './geometry.js';

/**
 * How the subject was determined.
 * - `saliency`: salient-object model (optionally fused with faces)
 * - `faces`: face detector only (saliency was empty or unavailable)
 * - `attention`: sharp attention heuristic fallback
 * - `center`: last-resort image center
 * - `manual`: user override
 */
export type DetectionMethod = 'saliency' | 'faces' | 'attention' | 'center' | 'manual';

/** The visually important region of the source, in normalized coordinates. */
export interface Subject {
  box: NormRect;
  focal: NormPoint;
  confidence: number;
  method: DetectionMethod;
}

/** Confidence below which targets are flagged with a "check this crop" hint. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export const CENTER_SUBJECT: Subject = {
  box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  focal: { x: 0.5, y: 0.5 },
  confidence: 0,
  method: 'center',
};
