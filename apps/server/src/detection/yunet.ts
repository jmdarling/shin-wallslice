import type { Sharp } from 'sharp';
import { ort } from './onnx.js';
import type { Face } from './types.js';

const INPUT_SIZE = 640;
const STRIDES = [8, 16, 32] as const;
const SCORE_THRESHOLD = 0.7;
const NMS_THRESHOLD = 0.3;
/** Ignore faces smaller than this fraction of the image's longest side. */
const MIN_FACE_SIDE = 0.015;

interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * Face detection with YuNet (OpenCV Zoo, 2023mar). Input is a 640×640 BGR letterbox with values in
 * 0–255; outputs are per-stride grids of class/objectness scores and box regressions.
 */
export class YunetFaces {
  constructor(private readonly session: ort.InferenceSession) {}

  async run(image: Sharp, size: { width: number; height: number }): Promise<Face[]> {
    const scale = INPUT_SIZE / Math.max(size.width, size.height);
    const { data } = await image
      .clone()
      .flatten({ background: '#000' })
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'contain', position: 'left top', background: '#000' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const plane = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = data[i * 3 + 2]!; // B
      input[plane + i] = data[i * 3 + 1]!; // G
      input[2 * plane + i] = data[i * 3]!; // R
    }

    const outputs = await this.session.run({
      [this.session.inputNames[0]!]: new ort.Tensor('float32', input, [
        1,
        3,
        INPUT_SIZE,
        INPUT_SIZE,
      ]),
    });

    const candidates: PixelBox[] = [];
    for (const stride of STRIDES) {
      const cls = outputs[`cls_${stride}`]!.data as Float32Array;
      const obj = outputs[`obj_${stride}`]!.data as Float32Array;
      const bbox = outputs[`bbox_${stride}`]!.data as Float32Array;
      const cols = INPUT_SIZE / stride;
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(clamp01(cls[i]!) * clamp01(obj[i]!));
        if (score < SCORE_THRESHOLD) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = (col + bbox[i * 4]!) * stride;
        const cy = (row + bbox[i * 4 + 1]!) * stride;
        const width = Math.exp(bbox[i * 4 + 2]!) * stride;
        const height = Math.exp(bbox[i * 4 + 3]!) * stride;
        candidates.push({ x: cx - width / 2, y: cy - height / 2, width, height, score });
      }
    }

    const minSide = MIN_FACE_SIDE * INPUT_SIZE;
    return nms(candidates, NMS_THRESHOLD)
      .filter((face) => Math.max(face.width, face.height) >= minSide)
      .map((face) => {
        const x = Math.max(0, face.x / scale);
        const y = Math.max(0, face.y / scale);
        const right = Math.min(size.width, (face.x + face.width) / scale);
        const bottom = Math.min(size.height, (face.y + face.height) / scale);
        return {
          box: {
            x: x / size.width,
            y: y / size.height,
            width: Math.max(0, right - x) / size.width,
            height: Math.max(0, bottom - y) / size.height,
          },
          score: face.score,
        };
      })
      .filter((face) => face.box.width > 0 && face.box.height > 0);
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function iou(a: PixelBox, b: PixelBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function nms(boxes: PixelBox[], threshold: number): PixelBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: PixelBox[] = [];
  for (const box of sorted) {
    if (kept.every((other) => iou(box, other) < threshold)) kept.push(box);
  }
  return kept;
}
