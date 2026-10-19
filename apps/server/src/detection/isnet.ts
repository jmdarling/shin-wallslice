import type { Sharp } from 'sharp';
import { ort } from './onnx.js';
import type { SaliencyResult } from './types.js';

const INPUT_SIZE = 1024;
/** Saliency maps are analysed on a coarser grid; plenty for a bounding box. */
const GRID = 256;
const MASK_THRESHOLD = 0.5;
/** Components with less than this share of the dominant component's mass are ignored. */
const COMPONENT_MASS_RATIO = 0.25;
const MIN_COVERAGE = 0.002;

/**
 * Salient-object segmentation with ISNet (DIS, `isnet-general-use`).
 * Pre/post-processing follows the reference implementation: RGB scaled to [0, 1] by the image max,
 * mean 0.5 / std 1.0, 1024×1024 stretched input; output min-max normalized.
 */
export class IsnetSaliency {
  constructor(private readonly session: ort.InferenceSession) {}

  async run(image: Sharp): Promise<SaliencyResult | undefined> {
    const { data } = await image
      .clone()
      .flatten({ background: '#000' })
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let max = 1;
    for (const value of data) if (value > max) max = value;
    const plane = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = data[i * 3]! / max - 0.5;
      input[plane + i] = data[i * 3 + 1]! / max - 0.5;
      input[2 * plane + i] = data[i * 3 + 2]! / max - 0.5;
    }

    const inputName = this.session.inputNames[0]!;
    const outputName = this.session.outputNames[0]!;
    const outputs = await this.session.run({
      [inputName]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });
    const raw = outputs[outputName]!.data as Float32Array;
    return analyseSaliency(downsample(normalize(raw), INPUT_SIZE, GRID), GRID);
  }
}

function normalize(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  const result = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) result[i] = (values[i]! - min) / range;
  return result;
}

/** Average-pool a square map from `size` to `grid`. */
function downsample(values: Float32Array, size: number, grid: number): Float32Array {
  const factor = size / grid;
  const result = new Float32Array(grid * grid);
  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / factor);
    for (let x = 0; x < size; x++) {
      result[gy * grid + Math.floor(x / factor)]! += values[y * size + x]!;
    }
  }
  const area = factor * factor;
  for (let i = 0; i < result.length; i++) result[i]! /= area;
  return result;
}

interface Component {
  mass: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

/**
 * Turn a saliency map (values 0–1, square grid) into a subject box, focal point and confidence.
 * Exported for testing and reuse by other detectors.
 */
export function analyseSaliency(map: Float32Array, grid: number): SaliencyResult | undefined {
  const labels = new Int32Array(map.length).fill(-1);
  const components: Component[] = [];
  const stack: number[] = [];

  for (let start = 0; start < map.length; start++) {
    if (labels[start] !== -1 || map[start]! < MASK_THRESHOLD) continue;
    const component: Component = {
      mass: 0, area: 0, minX: grid, minY: grid, maxX: 0, maxY: 0, sumX: 0, sumY: 0,
    };
    const label = components.length;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % grid;
      const y = (index - x) / grid;
      const weight = map[index]!;
      component.mass += weight;
      component.area += 1;
      component.sumX += (x + 0.5) * weight;
      component.sumY += (y + 0.5) * weight;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x + 1);
      component.maxY = Math.max(component.maxY, y + 1);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < grid - 1 ? index + 1 : -1,
        y > 0 ? index - grid : -1,
        y < grid - 1 ? index + grid : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && labels[next] === -1 && map[next]! >= MASK_THRESHOLD) {
          labels[next] = label;
          stack.push(next);
        }
      }
    }
    components.push(component);
  }

  if (components.length === 0) return undefined;
  const dominant = Math.max(...components.map((c) => c.mass));
  const kept = components.filter((c) => c.mass >= dominant * COMPONENT_MASS_RATIO);

  const totalArea = grid * grid;
  const area = kept.reduce((sum, c) => sum + c.area, 0);
  const coverage = area / totalArea;
  if (coverage < MIN_COVERAGE) return undefined;

  const mass = kept.reduce((sum, c) => sum + c.mass, 0);
  const box = {
    x: Math.min(...kept.map((c) => c.minX)) / grid,
    y: Math.min(...kept.map((c) => c.minY)) / grid,
    width: 0,
    height: 0,
  };
  box.width = Math.max(...kept.map((c) => c.maxX)) / grid - box.x;
  box.height = Math.max(...kept.map((c) => c.maxY)) / grid - box.y;
  const focal = {
    x: kept.reduce((sum, c) => sum + c.sumX, 0) / mass / grid,
    y: kept.reduce((sum, c) => sum + c.sumY, 0) / mass / grid,
  };

  // Certainty: how strongly salient the kept region is, discounted when "everything" is salient
  // (no clear subject) or when the subject is fragmented into many pieces.
  const certainty = mass / area;
  const coveragePenalty = coverage <= 0.6 ? 1 : Math.max(0.3, 1 - (coverage - 0.6) * 2);
  const fragmentPenalty = 1 / Math.sqrt(kept.length);
  const confidence = Math.min(1, certainty * coveragePenalty * fragmentPenalty);

  return { box, focal, confidence };
}
