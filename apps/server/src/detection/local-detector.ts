import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { CENTER_SUBJECT, clampNormRect, type Size, type Subject } from '@shin-wallslice/core';
import { openImage } from '../image/sharp-io.js';
import { fuseSubject } from './fuse.js';
import { IsnetSaliency } from './isnet.js';
import { loadModel } from './onnx.js';
import type { Face, SaliencyResult, SubjectDetector } from './types.js';
import { YunetFaces } from './yunet.js';

export const ISNET_FILE = 'isnet-general-use.onnx';
export const YUNET_FILE = 'face_detection_yunet_2023mar.onnx';

/** Working copy size: large enough for both models, small enough to decode quickly. */
const WORKING_MAX_SIDE = 1280;

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * v1 local detector: ISNet saliency + YuNet faces, falling back to sharp's attention heuristic and
 * finally the image center. Missing models degrade gracefully instead of failing startup.
 */
export class LocalSubjectDetector implements SubjectDetector {
  readonly name = 'local';

  private constructor(
    private readonly saliency: IsnetSaliency | undefined,
    private readonly faces: YunetFaces | undefined,
    private readonly maxInputMegapixels: number,
    private readonly logger: Logger,
  ) {}

  get ready(): boolean {
    return this.saliency !== undefined && this.faces !== undefined;
  }

  static async create(modelsDir: string, maxInputMegapixels: number, logger: Logger) {
    const [isnet, yunet] = await Promise.all([
      loadModel(join(modelsDir, ISNET_FILE)),
      loadModel(join(modelsDir, YUNET_FILE)),
    ]);
    if ('error' in isnet) logger.warn(`Saliency model unavailable (${isnet.error}); using fallback.`);
    if ('error' in yunet) logger.warn(`Face model unavailable (${yunet.error}); faces disabled.`);
    return new LocalSubjectDetector(
      'session' in isnet ? new IsnetSaliency(isnet.session) : undefined,
      'session' in yunet ? new YunetFaces(yunet.session) : undefined,
      maxInputMegapixels,
      logger,
    );
  }

  async detect(sourcePath: string): Promise<Subject> {
    const { data, info } = await openImage(sourcePath, this.maxInputMegapixels)
      .resize(WORKING_MAX_SIDE, WORKING_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    const working = sharp(data);
    const size = { width: info.width, height: info.height };

    const [saliency, faces] = await Promise.all([
      this.runSafely('saliency', () => this.saliency?.run(working)),
      this.runSafely('faces', () => this.faces?.run(working, size)),
    ]);
    const fused = fuseSubject(saliency as SaliencyResult | undefined, (faces as Face[] | undefined) ?? []);
    if (fused) return fused;

    return (await this.runSafely('attention', () => attentionSubject(working, size))) ?? CENTER_SUBJECT;
  }

  private async runSafely<T>(label: string, task: () => Promise<T> | undefined): Promise<T | undefined> {
    try {
      return await task();
    } catch (error) {
      this.logger.warn(`${label} detection failed: ${(error as Error).message}`);
      return undefined;
    }
  }
}

/**
 * Fallback: sharp's attention strategy (luminance, saturation, skin tones).
 * A cover resize only crops along one axis, so each axis gets its own pass at scale 1.
 */
async function attentionSubject(image: Sharp, size: Size): Promise<Subject> {
  const width = Math.max(1, Math.round(size.width / 2));
  const height = Math.max(1, Math.round(size.height / 2));
  const attention = { fit: 'cover', position: sharp.strategy.attention } as const;
  const [{ info: horizontal }, { info: vertical }] = await Promise.all([
    image.clone().resize(width, size.height, attention).toBuffer({ resolveWithObject: true }),
    image.clone().resize(size.width, height, attention).toBuffer({ resolveWithObject: true }),
  ]);
  const box = clampNormRect({
    x: Math.abs(horizontal.cropOffsetLeft ?? 0) / size.width,
    y: Math.abs(vertical.cropOffsetTop ?? 0) / size.height,
    width: width / size.width,
    height: height / size.height,
  });
  const focal = {
    x: horizontal.attentionX !== undefined ? horizontal.attentionX / size.width : box.x + box.width / 2,
    y: vertical.attentionY !== undefined ? vertical.attentionY / size.height : box.y + box.height / 2,
  };
  return { box, focal, confidence: 0.3, method: 'attention' };
}
