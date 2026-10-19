import { describe, expect, it } from 'vitest';
import { baseNameFromFilename, singleDownloadName, slugify } from '../src/index.js';

describe('slugify', () => {
  it('produces kebab-case', () => {
    expect(slugify('Red Balloon over Tokyo!')).toBe('red-balloon-over-tokyo');
    expect(slugify('Pokémon — Pikachu')).toBe('pokemon-pikachu');
  });

  it('never produces path traversal or empty names', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('...')).toBe('wallpaper');
    expect(slugify('')).toBe('wallpaper');
  });

  it('limits length without trailing dashes', () => {
    const slug = slugify('a '.repeat(100));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('baseNameFromFilename', () => {
  it('strips paths and extensions', () => {
    expect(baseNameFromFilename('C:\\Users\\me\\Mountain Sunset.JPG')).toBe('mountain-sunset');
    expect(baseNameFromFilename('/images/space%20cat.webp')).toBe('space-cat');
  });
});

describe('singleDownloadName', () => {
  it('includes the target key and size', () => {
    expect(singleDownloadName('Space Cat', 'apple-iphone-18-pro-max', 1320, 2868)).toBe(
      'space-cat_apple-iphone-18-pro-max_1320x2868.png',
    );
  });
});
