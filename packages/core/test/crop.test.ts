import { describe, expect, it } from 'vitest';
import { baseCropSize, computeCrop, type Subject } from '../src/index.js';

const centered: Pick<Subject, 'box' | 'focal'> = {
  box: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
  focal: { x: 0.5, y: 0.5 },
};

describe('baseCropSize', () => {
  it('keeps full height for a tall target on a wide source', () => {
    expect(baseCropSize({ width: 4000, height: 2000 }, { width: 1000, height: 2000 })).toEqual({
      width: 1000,
      height: 2000,
    });
  });

  it('keeps full width for a wide target on a tall source', () => {
    expect(baseCropSize({ width: 2000, height: 4000 }, { width: 1920, height: 1080 })).toEqual({
      width: 2000,
      height: 1125,
    });
  });
});

describe('computeCrop', () => {
  const source = { width: 6000, height: 4000 };

  it('produces the largest crop with the output aspect ratio', () => {
    const result = computeCrop(source, centered, { width: 1320, height: 2868 });
    expect(result.rect.height).toBe(4000);
    expect(result.rect.width).toBe(Math.round((4000 * 1320) / 2868));
  });

  it('centers on a centered subject', () => {
    const result = computeCrop(source, centered, { width: 1000, height: 1000 });
    expect(result.rect).toEqual({ x: 1000, y: 0, width: 4000, height: 4000 });
  });

  it('follows an off-center subject', () => {
    const subject = {
      box: { x: 0.6, y: 0.4, width: 0.1, height: 0.2 },
      focal: { x: 0.65, y: 0.5 },
    };
    const result = computeCrop(source, subject, { width: 1000, height: 2000 });
    const centerX = result.rect.x + result.rect.width / 2;
    expect(centerX).toBeCloseTo(0.65 * 6000, -1);
    expect(result.subjectClipped).toBe(false);
  });

  it('clamps the crop to the source bounds', () => {
    const subject = { box: { x: 0.95, y: 0.45, width: 0.05, height: 0.1 }, focal: { x: 0.99, y: 0.5 } };
    const result = computeCrop(source, subject, { width: 1000, height: 2000 });
    expect(result.rect.x + result.rect.width).toBe(6000);
  });

  it('keeps the whole subject in frame when it fits, even if the focal point is near an edge of it', () => {
    const subject = { box: { x: 0.2, y: 0.1, width: 0.3, height: 0.8 }, focal: { x: 0.21, y: 0.5 } };
    const result = computeCrop(source, subject, { width: 1000, height: 2000 });
    const boxLeft = 0.2 * 6000;
    const boxRight = 0.5 * 6000;
    expect(result.rect.x).toBeLessThanOrEqual(boxLeft);
    expect(result.rect.x + result.rect.width).toBeGreaterThanOrEqual(boxRight);
    expect(result.subjectClipped).toBe(false);
  });

  it('centers on the focal point and reports clipping when the subject cannot fit', () => {
    const subject = { box: { x: 0, y: 0.3, width: 1, height: 0.4 }, focal: { x: 0.6, y: 0.5 } };
    const result = computeCrop(source, subject, { width: 1000, height: 2000 });
    const centerX = result.rect.x + result.rect.width / 2;
    expect(centerX).toBeCloseTo(3600, -1);
    expect(result.subjectClipped).toBe(true);
  });

  it('applies manual center and zoom overrides', () => {
    const result = computeCrop(source, centered, { width: 1000, height: 1000 }, {
      center: { x: 0.25, y: 0.25 },
      zoom: 0.5,
    });
    expect(result.rect).toEqual({ x: 500, y: 0, width: 2000, height: 2000 });
  });

  it('clamps zoom into the allowed range', () => {
    const tooFar = computeCrop(source, centered, { width: 1000, height: 1000 }, { zoom: 0.001 });
    expect(tooFar.rect.width).toBe(400);
    const outward = computeCrop(source, centered, { width: 1000, height: 1000 }, { zoom: 5 });
    expect(outward.rect.width).toBe(4000);
  });

  it('flags upscaling when the crop is smaller than the output', () => {
    const small = computeCrop({ width: 1920, height: 1080 }, centered, { width: 1320, height: 2868 });
    expect(small.upscaled).toBe(true);
    expect(small.scale).toBeCloseTo(2868 / 1080, 2);
  });

  it('does not flag downscaling or near-1 scaling', () => {
    const big = computeCrop(source, centered, { width: 1320, height: 2868 });
    expect(big.upscaled).toBe(false);
    const exact = computeCrop({ width: 2560, height: 1600 }, centered, { width: 2560, height: 1600 });
    expect(exact.rect).toEqual({ x: 0, y: 0, width: 2560, height: 1600 });
    expect(exact.scale).toBe(1);
    expect(exact.upscaled).toBe(false);
  });

  it('is deterministic', () => {
    const a = computeCrop(source, centered, { width: 1179, height: 2556 });
    const b = computeCrop(source, centered, { width: 1179, height: 2556 });
    expect(a).toEqual(b);
  });
});
