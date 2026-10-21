import sharp from 'sharp';
import type { Anchor, Crop, Device } from './protocol.js';
sharp.cache(false);
sharp.concurrency(1);
export function cropSize(width: number, height: number, device: Device): Crop {
  const ratio = device.width / device.height;
  return {
    left: 0,
    top: 0,
    width: Math.max(1, Math.min(width, Math.round(height * ratio))),
    height: Math.max(1, Math.min(height, Math.round(width / ratio))),
  };
}
export function anchorCrop(
  width: number,
  height: number,
  device: Device,
  anchor: Anchor,
): Crop {
  const crop = cropSize(width, height, device);
  crop.left = Math.round(
    (width - crop.width) *
      (anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5),
  );
  crop.top = Math.round(
    (height - crop.height) *
      (anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5),
  );
  return crop;
}
export async function smartCrop(
  source: string,
  width: number,
  height: number,
  device: Device,
): Promise<Crop> {
  const crop = cropSize(width, height, device);
  const { info } = await sharp(source)
    .resize(crop.width, crop.height, {
      fit: 'cover',
      position: sharp.strategy.entropy,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    ...crop,
    left: Math.min(
      width - crop.width,
      Math.max(0, -(info.cropOffsetLeft ?? 0)),
    ),
    top: Math.min(
      height - crop.height,
      Math.max(0, -(info.cropOffsetTop ?? 0)),
    ),
  };
}
export function oledify(data: Buffer, channels: number, threshold: number) {
  for (let i = 0; i < data.length; i += channels) {
    if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) <= threshold)
      data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return data;
}
export async function renderImage(
  source: string,
  destination: string,
  crop: Crop | undefined,
  width: number,
  height: number,
  oled: boolean,
  threshold: number,
) {
  let pipeline = sharp(source);
  if (crop) pipeline = pipeline.extract(crop);
  pipeline = pipeline
    .resize(width, height, {
      fit: crop ? 'cover' : 'inside',
      withoutEnlargement: !crop,
    })
    .toColourspace('srgb')
    .ensureAlpha();
  if (oled) {
    const { data, info } = await pipeline
      .raw()
      .toBuffer({ resolveWithObject: true });
    await sharp(oledify(data, info.channels, threshold), { raw: info })
      .png()
      .toFile(destination);
  } else await pipeline.png().toFile(destination);
}
export function safeName(value: string): string {
  return (
    value
      .normalize('NFKC')
      .replace(/[/\\]/g, '-')
      .replace(/[^\p{L}\p{N} ._-]/gu, '-')
      .replace(/^[.\s-]+|[.\s-]+$/g, '')
      .slice(0, 100)
      .replace(/[.\s-]+$/g, '') || 'wallpaper'
  );
}
