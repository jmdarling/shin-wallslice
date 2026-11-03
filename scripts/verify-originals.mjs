/* global document, innerWidth */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../packages/client/node_modules/playwright/index.mjs';

const require = createRequire(
  new URL('../packages/server/package.json', import.meta.url),
);
const {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} = require('@zip.js/zip.js');
const base = process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173';
const destination = '/tmp/shin-wallslice-v150-review/output';
const output = new URL('../docs/design/v1.5.0/', import.meta.url);
const sourcePath = fileURLToPath(
  new URL('../docs/images/dusk-ridges.png', import.meta.url),
);
const source = await readFile(sourcePath);
await mkdir(output, { recursive: true });
await mkdir(`${destination}/originals`, { recursive: true });
// Only the isolated review destination is modified by this harness.
assert.deepEqual(
  (await readdir(destination)).filter((name) => name !== 'originals'),
  [],
);
const originalPath = 'originals/Dusk Ridges.png';
await writeFile(
  `${destination}/${originalPath}`,
  'old original for replacement review',
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  colorScheme: 'light',
});
const evidence = {
  url: base,
  destination,
  original: originalPath,
  sourceBytes: source.length,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  verified: [],
  captures: [],
};

async function settled() {
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a?.manifest && !a.busy && !a.dirty;
  });
}
async function capture(file, width, appearance) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: appearance });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const app = document.querySelector('shin-app');
    await app.updateComplete;
    await Promise.all(
      [...app.shadowRoot.querySelectorAll('wa-button')].map(
        (button) => button.updateComplete,
      ),
    );
  });
  await page.waitForFunction(() =>
    [
      ...document.querySelector('shin-app').shadowRoot.querySelectorAll('img'),
    ].every((i) => i.complete && i.naturalWidth),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: fileURLToPath(new URL(file, output)),
    fullPage: true,
    animations: 'disabled',
  });
  evidence.captures.push(file);
}
async function zipFiles() {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'Dusk Ridges.zip');
  const reader = new ZipReader(
    new Uint8ArrayReader(await readFile(await download.path())),
  );
  const files = new Map();
  try {
    for (const entry of await reader.getEntries()) {
      assert.equal(entry.directory, false);
      files.set(
        entry.filename,
        Buffer.from(await entry.getData(new Uint8ArrayWriter())),
      );
    }
  } finally {
    await reader.close();
    await download.delete();
  }
  assert.ok(files.get(originalPath).equals(source));
  return files;
}
async function save() {
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a.serverSave && !a.busy;
  });
  return page.evaluate(() => document.querySelector('shin-app').serverSave);
}
async function replace() {
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('shin-app').serverSave?.state === 'saved',
  );
  return page.evaluate(() => document.querySelector('shin-app').serverSave);
}
async function verifySaved(result, files) {
  assert.equal(result.destination, destination);
  assert.equal(result.state, 'saved');
  assert.deepEqual(result.saved, [...files.keys()]);
  for (const [path, bytes] of files)
    assert.ok((await readFile(`${destination}/${path}`)).equals(bytes));
  // Device outputs also equal the live previews, independently of the ZIP.
  const manifest = await page.evaluate(
    () => document.querySelector('shin-app').manifest,
  );
  for (const [id, url] of Object.entries(manifest.outputs)) {
    const bytes = Buffer.from(
      await fetch(base + url).then((r) => r.arrayBuffer()),
    );
    const entry =
      files.get(`${id}/Dusk Ridges.png`) || files.get(`Dusk Ridges-${id}.png`);
    assert.ok(entry.equals(bytes));
  }
}
try {
  const catalog = await fetch(`${base}/api/catalog`).then((r) => r.json());
  assert.equal(catalog.serverSavingEnabled, true);
  assert.equal(catalog.aiEnabled, false);
  const preferences = {
    ...catalog.preferences,
    devices: catalog.devices.slice(0, 2).map((d) => d.id),
    method: 'anchor',
    anchor: 'center',
    organizeIntoDeviceFolders: false,
  };
  assert.equal(
    (
      await fetch(`${base}/api/preferences`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(preferences),
      })
    ).status,
    200,
  );
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  await page.locator('input[type=file]').setInputFiles(sourcePath);
  await settled();
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('Dusk Ridges');
  const flat = await zipFiles();
  assert.equal(flat.size, 3);
  const review = await save();
  assert.equal(review.state, 'conflicts');
  assert.deepEqual(review.conflicts, [originalPath]);
  assert.deepEqual(review.saved, []);
  assert.deepEqual(await readdir(destination), ['originals']);
  await capture('original-conflict-320-dark.png', 320, 'dark');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    await readFile(`${destination}/${originalPath}`, 'utf8'),
    'old original for replacement review',
  );
  assert.deepEqual(await readdir(destination), ['originals']);
  await save();
  const flatSave = await replace();
  await verifySaved(flatSave, flat);
  await capture('saved-flat-1440-light.png', 1440, 'light');
  evidence.verified.push(
    'Actual ZIP download and server save contain identical original upload bytes and matching preview PNGs in flat layout.',
    'An original-only conflict prevented device writes; Cancel retained old bytes; Replace saved all reviewed outputs.',
  );
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .check();
  const organized = await zipFiles();
  assert.equal(organized.size, 3);
  assert.equal((await save()).state, 'conflicts');
  const organizedSave = await replace();
  await verifySaved(organizedSave, organized);
  await capture('saved-organized-320-light.png', 320, 'light');
  await capture('saved-organized-1440-dark.png', 1440, 'dark');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.waitForFunction(
    () => document.querySelector('shin-app').page === 'input',
  );
  for (const [path, bytes] of [...flat, ...organized])
    assert.ok((await readFile(`${destination}/${path}`)).equals(bytes));
  evidence.verified.push(
    'Organized ZIP and server save retain a single originals/ entry; original and generated files survive Start over.',
    'Real conflict and success feedback fits 320px and 1440px in both appearances.',
  );
  await writeFile(
    new URL('verification.json', output),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
