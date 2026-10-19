import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { badRequest, payloadTooLarge } from '../errors.js';

export interface UrlFetchOptions {
  maxBytes: number;
  allowPrivate: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface FetchedImage {
  buffer: Buffer;
  /** Final URL after redirects (used for the default name). */
  url: URL;
}

/** Always refused: loopback, link-local (incl. cloud metadata), unspecified, multicast. */
const alwaysBlocked = new BlockList();
alwaysBlocked.addSubnet('0.0.0.0', 8, 'ipv4');
alwaysBlocked.addSubnet('127.0.0.0', 8, 'ipv4');
alwaysBlocked.addSubnet('169.254.0.0', 16, 'ipv4');
alwaysBlocked.addSubnet('224.0.0.0', 4, 'ipv4');
alwaysBlocked.addSubnet('240.0.0.0', 4, 'ipv4');
alwaysBlocked.addAddress('::', 'ipv6');
alwaysBlocked.addAddress('::1', 'ipv6');
alwaysBlocked.addSubnet('fe80::', 10, 'ipv6');
alwaysBlocked.addSubnet('ff00::', 8, 'ipv6');

/** Refused only when URL_FETCH_ALLOW_PRIVATE=false. */
const privateRanges = new BlockList();
privateRanges.addSubnet('10.0.0.0', 8, 'ipv4');
privateRanges.addSubnet('172.16.0.0', 12, 'ipv4');
privateRanges.addSubnet('192.168.0.0', 16, 'ipv4');
privateRanges.addSubnet('100.64.0.0', 10, 'ipv4');
privateRanges.addSubnet('fc00::', 7, 'ipv6');

function normalizeAddress(address: string): { address: string; family: 'ipv4' | 'ipv6' } {
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) is checked as IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return { address: mapped[1], family: 'ipv4' };
  return { address, family: isIP(address) === 6 ? 'ipv6' : 'ipv4' };
}

async function assertAllowedHost(url: URL, allowPrivate: boolean): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('invalid_url', 'Only http and https URLs are supported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => {
        throw badRequest('invalid_url', `Could not resolve ${hostname}.`);
      });
  for (const entry of addresses) {
    const { address, family } = normalizeAddress(entry.address);
    if (alwaysBlocked.check(address, family) || (!allowPrivate && privateRanges.check(address, family))) {
      throw badRequest('url_not_allowed', `Fetching from ${hostname} is not allowed.`);
    }
  }
}

async function readLimited(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw payloadTooLarge(`The image is larger than ${maxBytes / 1024 / 1024} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch an image URL with SSRF guards: http(s) only, every redirect hop re-validated,
 * loopback/link-local always refused, size and time limits enforced.
 */
export async function fetchImageUrl(rawUrl: string, options: UrlFetchOptions): Promise<FetchedImage> {
  const { maxBytes, allowPrivate, timeoutMs = 30_000, maxRedirects = 5 } = options;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw badRequest('invalid_url', 'That is not a valid URL.');
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertAllowedHost(url, allowPrivate);
      const response = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { accept: 'image/*', 'user-agent': 'shin-wallslice' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw badRequest('fetch_failed', 'Redirect without a location.');
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw badRequest('fetch_failed', `The server responded with HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > maxBytes) {
        await response.body.cancel();
        throw payloadTooLarge(`The image is larger than ${maxBytes / 1024 / 1024} MB.`);
      }
      return { buffer: await readLimited(response.body, maxBytes), url };
    }
  } catch (error) {
    if (signal.aborted) throw badRequest('fetch_timeout', 'Fetching the image timed out.');
    if (error instanceof TypeError) throw badRequest('fetch_failed', 'Could not download the image.');
    throw error;
  }
  throw badRequest('fetch_failed', 'Too many redirects.');
}
