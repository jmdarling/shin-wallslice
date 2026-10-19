import type { NormPoint, NormRect, Subject } from '@shin-wallslice/core';

/** Finds the subject of an image. Implementations are swappable (local, cloud, hybrid). */
export interface SubjectDetector {
  readonly name: string;
  /** Whether the detector's models are loaded; reported by /api/health. */
  readonly ready: boolean;
  detect(sourcePath: string): Promise<Subject>;
}

/** Output of a salient-object model, before fusion. */
export interface SaliencyResult {
  box: NormRect;
  focal: NormPoint;
  confidence: number;
}

export interface Face {
  box: NormRect;
  score: number;
}
