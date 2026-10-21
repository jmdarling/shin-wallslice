import { Buffer } from 'node:buffer';
// Executed inside the built image by docker-smoke.mjs, using only runtime dependencies.
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../packages/server/package.json', import.meta.url),
);
const sharp = require('sharp');
const {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} = require('@zip.js/zip.js');
import { loadConfig } from '../packages/server/dist/config.js';
import { readFile } from 'node:fs/promises';
const config = await loadConfig();
const base = `http://127.0.0.1:${config.port}`;
async function json(path, init) {
  const r = await fetch(base + path, init);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const catalog = await json('/api/catalog');
const quick = process.env.WALLSLICE_SMOKE_QUICK === '1';
for (const width of quick ? [1800] : [7680, 8192]) {
  // A spatial colour gradient exercises real resampling while keeping the fixture reproducible.
  const height = quick ? 600 : 4320;
  let pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      pixels[i] = Math.floor((x / width) * 255);
      pixels[i + 1] = Math.floor((y / height) * 255);
      pixels[i + 2] = (x + y) % 256;
    }
  const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  pixels = null;
  const job = await json('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: source,
  });
  if (job.width !== width || job.height !== height)
    throw new Error('Source dimensions changed');
  const output = await json(`/api/jobs/${job.id}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crops: job.smart, oled: true, threshold: 24 }),
  });
  if (Object.keys(output.outputs).length !== 6)
    throw new Error('Missing outputs');
  const zipResponse = await fetch(
    `${base}/api/jobs/${job.id}/zip/${output.revision}?name=container-test`,
  );
  if (!zipResponse.ok) throw new Error(await zipResponse.text());
  const reader = new ZipReader(
    new Uint8ArrayReader(new Uint8Array(await zipResponse.arrayBuffer())),
  );
  const entries = await reader.getEntries();
  if (entries.length !== 6) throw new Error('Wrong archive entry count');
  for (const device of catalog.devices) {
    const response = await fetch(base + output.outputs[device.id]);
    if (!response.ok) throw new Error(await response.text());
    const data = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(data).metadata();
    if (
      metadata.width !== device.width ||
      metadata.height !== device.height ||
      metadata.format !== 'png'
    )
      throw new Error('Incorrect output dimensions');
    const entry = entries.find(
      (e) => e.filename === `container-test-${device.id}.png`,
    );
    if (!entry || entry.directory) throw new Error('Wrong archive names');
    const zipped = Buffer.from(await entry.getData(new Uint8ArrayWriter()));
    if (!zipped.equals(data)) throw new Error('ZIP/individual contents differ');
    const { data: raw, info } = await sharp(data)
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < raw.length; i += info.channels) {
      const max = Math.max(raw[i], raw[i + 1], raw[i + 2]);
      if (max > 0 && max <= 24)
        throw new Error('OLEDify was not applied after resizing');
    }
  }
  await reader.close();
  await json(`/api/jobs/${job.id}`, { method: 'DELETE' });
  console.log(
    `Complete ${width}×${height} workflow passed with all six presets and OLEDify.`,
  );
}
const preferences = {
  ...catalog.preferences,
  anchor: 'bottom-right',
  method: 'anchor',
  oled: true,
  threshold: 24,
};
await json('/api/preferences', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(preferences),
});
if (
  JSON.stringify(
    JSON.parse(
      await readFile(`${config.dataDirectory}/preferences.json`, 'utf8'),
    ),
  ) !== JSON.stringify(preferences)
)
  throw new Error('Preferences were not persisted');
console.log(
  'PNG dimensions, OLED cutoff, matching ZIP contents, cleanup, and flat-file preferences verified.',
);

const memoryMax = await readFile('/sys/fs/cgroup/memory.max', 'utf8');
if (memoryMax.trim() !== '4294967296')
  throw new Error(`Expected 4 GiB cgroup memory limit, got ${memoryMax}`);
const peak = Number(await readFile('/sys/fs/cgroup/memory.peak', 'utf8'));
console.log(
  `4 GiB cgroup limit verified; peak combined server/test memory: ${Math.ceil(peak / 1048576)} MiB.`,
);
