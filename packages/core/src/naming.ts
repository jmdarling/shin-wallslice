export const MAX_NAME_LENGTH = 80;
export const FALLBACK_NAME = 'wallpaper';

/**
 * Convert arbitrary text into a filesystem-safe kebab-case slug.
 * Never returns an empty string, and never contains path separators or dots.
 */
export function slugify(input: string, maxLength = MAX_NAME_LENGTH): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || FALLBACK_NAME;
}

/** Derive a default base name from an uploaded filename or URL path. */
export function baseNameFromFilename(filename: string): string {
  const lastSegment = filename.split(/[/\\]/).pop() ?? '';
  const withoutExtension = lastSegment.replace(/\.[a-z0-9]{1,5}$/i, '');
  return slugify(decodeURIComponentSafe(withoutExtension));
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** File name for a single-image download. */
export function singleDownloadName(baseName: string, targetKey: string, width: number, height: number): string {
  return `${slugify(baseName)}_${targetKey}_${width}x${height}.png`;
}
