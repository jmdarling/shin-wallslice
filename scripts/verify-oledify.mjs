// Live visual evaluation, separate from deterministic provider tests.
// Uses private runtime AI configuration without recording endpoints or credentials.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../packages/server/package.json', import.meta.url),
);
const sharp = require('sharp');
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../packages/server/dist/config.js';
import { AiConnection } from '../packages/server/dist/ai.js';
import {
  classifySource,
  prepareComparison,
  searchCutoff,
} from '../packages/server/dist/oled-analysis.js';
import { oledify } from '../packages/server/dist/imaging.js';
const root = fileURLToPath(new URL('../docs/design/v1.3.0/', import.meta.url));
await mkdir(root, { recursive: true });
const config = await loadConfig();
if (!config.ai?.enabled)
  throw new Error('Enable a configured vision service for live review.');
const connection = new AiConnection(config.ai);
const gradient = Buffer.alloc(800 * 500 * 4);
for (let y = 0; y < 500; y++)
  for (let x = 0; x < 800; x++) {
    const i = (y * 800 + x) * 4;
    const value = Math.round((x / 799) * 64);
    gradient[i] = value;
    gradient[i + 1] = value;
    gradient[i + 2] = value;
    if (x > 180 && x < 620 && y > 150 && y < 350) {
      gradient[i] = 25;
      gradient[i + 1] = 28;
      gradient[i + 2] = 32;
    }
    gradient[i + 3] = 255;
  }
await sharp(gradient, { raw: { width: 800, height: 500, channels: 4 } })
  .png()
  .toFile(`${root}shadow-gradient-edges.png`);
await sharp(
  fileURLToPath(new URL('../docs/images/dusk-ridges.png', import.meta.url)),
)
  .linear(0.5)
  .png()
  .toFile(`${root}dark-artwork.png`);
const cases = [
  ['dark-artwork', `${root}dark-artwork.png`],
  [
    'dusk-ridges',
    fileURLToPath(new URL('../docs/images/dusk-ridges.png', import.meta.url)),
  ],
  ['earthrise', process.env.WALLSLICE_REVIEW_PHOTO || '/tmp/earthrise.jpg'],
  ['shadow-gradient-edges', `${root}shadow-gradient-edges.png`],
];
let evidence = {
  kind: 'live configured provider, not mocked',
  date: '2026-10-21',
  cases: [],
};
try {
  evidence = JSON.parse(await readFile(`${root}live-review.json`, 'utf8'));
} catch {
  /* First review run. */
}
for (const [name, source] of cases) {
  if (evidence.cases.some((c) => c.name === name && !c.result.failed)) continue;
  const local = await classifySource(
    source,
    config.oledMinimumDarkPercentage ?? 15,
    config.oledNearBlackCutoff ?? 32,
  );
  const image = await prepareComparison(source);
  await sharp(image.data, { raw: image.info })
    .png()
    .toFile(`${root}${name}-original.png`);
  let result;
  try {
    result = local.candidate
      ? await searchCutoff(
          connection,
          image,
          config.oledMaxVisionRequests ?? 8,
          AbortSignal.timeout(270_000),
        )
      : { oled: false, threshold: 16, evaluated: [], skipped: true };
  } catch {
    result = {
      failed: true,
      oled: local.candidate,
      threshold: 16,
      evaluated: [],
      message:
        'Live provider failed; local defaults retained. No completed recommendation.',
    };
  }
  const transformed = result.oled
    ? oledify(Buffer.from(image.data), 4, result.threshold)
    : image.data;
  await sharp(transformed, { raw: image.info })
    .png()
    .toFile(`${root}${name}-recommended.png`);
  evidence.cases.push({
    name,
    local,
    result,
    original: `${name}-original.png`,
    recommendation: `${name}-recommended.png`,
  });
  await writeFile(
    `${root}live-review.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(name, JSON.stringify({ local, result }));
}
