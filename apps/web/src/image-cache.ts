const cache = new Map<string, Promise<HTMLImageElement>>();

/** Load an image once and share the decoded element between all previews. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${url}`));
      image.src = url;
    });
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}
