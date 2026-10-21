import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
const sharp = createRequire(import.meta.url)(
  '../../../packages/server/node_modules/sharp',
);
const root = new URL('./', import.meta.url);
const output = new URL('implemented/', root);
const comparisons = [];
for (const screen of ['input', 'processing', 'download']) {
  for (const theme of ['light', 'dark']) {
    const original = await sharp(
      fileURLToPath(
        new URL(`mockups/passepartout-${screen}-desktop-${theme}.png`, root),
      ),
    )
      .resize({ width: 720 })
      .png()
      .toBuffer();
    const actual = await sharp(
      fileURLToPath(new URL(`${screen}-desktop-${theme}.png`, output)),
    )
      .resize({ width: 720 })
      .png()
      .toBuffer();
    const heights = await Promise.all([
      sharp(original).metadata(),
      sharp(actual).metadata(),
    ]);
    const header = Buffer.from(
      '<svg width="1440" height="44"><rect width="1440" height="44" fill="#f1f0f7"/><g fill="#292438" font-family="sans-serif" font-size="20"><text x="20" y="30">Original Passepartout proposal</text><text x="740" y="30">Implemented with reduced copy</text></g></svg>',
    );
    const file = `compare-${screen}-${theme}.png`;
    await sharp({
      create: {
        width: 1440,
        height: Math.max(...heights.map((h) => h.height)) + 44,
        channels: 3,
        background: '#f1f0f7',
      },
    })
      .composite([
        { input: header, left: 0, top: 0 },
        { input: original, left: 0, top: 44 },
        { input: actual, left: 720, top: 44 },
      ])
      .png()
      .toFile(fileURLToPath(new URL(file, output)));
    comparisons.push({ screen, theme, file });
  }
}
const { captures } = JSON.parse(
  await readFile(new URL('verification.json', output)),
);
const tile = (file, title) =>
  `<a href="${file}"><img src="${file}" loading="lazy" alt="${title}"><span>${title}</span></a>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Passepartout implementation review</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f1f0f7;color:#292438;margin:0}main{max-width:1300px;margin:auto;padding:32px 24px}a{color:#624696}h1{font:40px/1.2 Georgia,serif}h2{margin-top:40px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}.grid a{display:block;padding:12px;background:white;border:1px solid #867a98;text-decoration:none}.grid img{display:block;width:100%;height:300px;object-fit:contain;object-position:top}.grid span{display:block;margin-top:12px}p{max-width:80ch}a:focus-visible{outline:3px solid #624696;outline-offset:4px}</style></head><body><main><p>shin-wallslice / v1.1.0</p><h1>Passepartout, with less text.</h1><p>Actual running-application captures. Click any image for full size. The original proposal is preserved alongside the implementation to show the agreed copy reductions.</p><p><a href="../README.md">Design decisions and adaptations</a> · <a href="../index.html">Original three directions</a> · <a href="http://127.0.0.1:5173/">Open the running app</a></p><h2>Proposal beside implementation</h2><div class="grid">${comparisons.map((c) => tile(c.file, `${c.screen} / desktop / ${c.theme}`)).join('')}</div>${[
  'input',
  'processing',
  'download',
]
  .map(
    (s) =>
      `<h2>${s[0].toUpperCase() + s.slice(1)}</h2><div class="grid">${captures
        .filter((f) => f.startsWith(s + '-'))
        .map((f) => tile(f, f.replace('.png', '').replaceAll('-', ' / ')))
        .join('')}</div>`,
  )
  .join(
    '',
  )}<h2>Long filename at 320px</h2><div class="grid">${tile('long-name-320.png', '100-character name, unchanged ZIP action size')}</div><p><a href="verification.json">Real source, PNG, ZIP, framing, OLEDify, and persistence verification</a></p></main></body></html>`;
await writeFile(
  new URL('index.html', output),
  await format(html, { parser: 'html' }),
);
console.log('Built implementation gallery and six side-by-side comparisons.');
