import sharp, { type Metadata, type Sharp } from 'sharp';
import type { Rect, Size } from '@shin-wallslice/core';
import { badRequest, unsupportedMedia } from '../errors.js';

export interface ProbedImage {
  /** Size after applying EXIF orientation. */
  size: Size;
  format: 'jpeg' | 'png' | 'webp' | 'avif';
}

export const PROXY_MAX_SIDE = 1600;

sharp.cache(false);

/** Open an image with the configured decode limits and EXIF orientation applied. */
export function openImage(input: string | Buffer, maxInputMegapixels: number): Sharp {
  return sharp(input, {
    limitInputPixels: maxInputMegapixels * 1_000_000,
    failOn: 'error',
    animated: false,
  }).rotate();
}

/**
 * Validate that a buffer is a supported, decodable image within the pixel limit.
 * Format is sniffed from the bytes, never trusted from headers or file names.
 */
export async function probeImage(buffer: Buffer, maxInputMegapixels: number): Promise<ProbedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: false, animated: false }).metadata();
  } catch {
    throw unsupportedMedia('The file is not a readable image.');
  }

  let format: ProbedImage['format'];
  if (metadata.format === 'jpeg' || metadata.format === 'png' || metadata.format === 'webp') {
    format = metadata.format;
  } else if (metadata.format === 'heif' && metadata.compression === 'av1') {
    format = 'avif';
  } else {
    throw unsupportedMedia('Unsupported format. Use JPEG, PNG, WebP or AVIF.');
  }

  const { width, height } = metadata;
  if (!width || !height) throw unsupportedMedia('The image has no dimensions.');
  const megapixels = (width * height) / 1_000_000;
  if (megapixels > maxInputMegapixels) {
    throw badRequest(
      'image_too_large',
      `The image is ${megapixels.toFixed(1)} MP; the limit is ${maxInputMegapixels} MP.`,
    );
  }

  // EXIF orientations 5–8 swap width and height.
  const swapped = (metadata.orientation ?? 1) >= 5;
  const size = swapped ? { width: height, height: width } : { width, height };

  // Fully decode once so corrupt files fail at ingest rather than at export time.
  try {
    await openImage(buffer, maxInputMegapixels).resize(64, 64, { fit: 'inside' }).raw().toBuffer();
  } catch {
    throw unsupportedMedia('The image could not be decoded.');
  }
  return { size, format };
}

/** Downscaled JPEG preview for the browser. */
export async function renderProxy(
  sourcePath: string,
  maxInputMegapixels: number,
): Promise<{ buffer: Buffer; size: Size }> {
  const { data, info } = await openImage(sourcePath, maxInputMegapixels)
    .resize(PROXY_MAX_SIDE, PROXY_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#000' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, size: { width: info.width, height: info.height } };
}

/** Render one target: extract the crop, resize to the exact output size, encode PNG (sRGB, no EXIF). */
export async function renderCrop(
  sourcePath: string,
  maxInputMegapixels: number,
  rect: Rect,
  output: Size,
): Promise<Buffer> {
  return openImage(sourcePath, maxInputMegapixels)
    .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
    .resize(output.width, output.height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('srgb')
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** Small JPEG for vision-model naming (never the full original). */
export async function renderNamingThumbnail(
  sourcePath: string,
  maxInputMegapixels: number,
): Promise<Buffer> {
  return openImage(sourcePath, maxInputMegapixels)
    .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#000' })
    .jpeg({ quality: 80 })
    .toBuffer();
}
