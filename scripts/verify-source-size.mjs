/* global document, innerWidth */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../packages/client/node_modules/playwright/index.mjs';

const require = createRequire(
  new URL('../packages/server/package.json', import.meta.url),
);
const sharp = require('sharp');
const base = process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173';
const output = new URL('../docs/design/v1.6.0/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  hasTouch: true,
});
const evidence = { url: base, verified: [], captures: [] };
const catalog = await (await fetch(`${base}/api/catalog`)).json();
assert.equal(catalog.aiEnabled, false);
const devices = catalog.devices;
const defaults = devices.slice(0, 2).map((d) => d.id);
async function choose(ids) {
  for (const d of devices)
    await page
      .getByRole('checkbox', { name: d.name, exact: true })
      .setChecked(ids.includes(d.id));
}
async function size(expected) {
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('shin-app')
        ?.shadowRoot.querySelector('.source-recommendation [role=status]')
        ?.textContent.includes(expected),
    expected,
  );
}
async function settled() {
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a?.manifest && !a.busy && !a.dirty;
  });
}
async function saved(ids) {
  await page.waitForFunction(async (ids) => {
    const result = await (await fetch('/api/catalog')).json();
    return (
      JSON.stringify(result.preferences.devices.toSorted()) ===
      JSON.stringify(ids.toSorted())
    );
  }, ids);
}
async function capture(file, width, theme) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.querySelector('shin-app').updateComplete;
  });
  await page.waitForFunction(() =>
    [
      ...document.querySelector('shin-app').shadowRoot.querySelectorAll('img'),
    ].every((img) => img.complete && img.naturalWidth),
  );
  if (width === 320) {
    const phone = page.getByRole('checkbox', {
      name: devices[0].name,
      exact: true,
    });
    await phone.tap();
    await size('2420 × 2420 px');
    await phone.tap();
    await size('2420 × 2868 px');
  }
  const controls = await page.evaluate(() =>
    [
      ...document
        .querySelector('shin-app')
        .shadowRoot.querySelectorAll(
          '.options label, input[type=file], .source-recommendation',
        ),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, height: r.height };
    }),
  );
  for (const r of controls) {
    assert.ok(r.left >= 0 && r.right <= width, JSON.stringify(r));
    assert.ok(r.height >= 44, JSON.stringify(r));
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const path = fileURLToPath(new URL(file, output));
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  evidence.captures.push(file);
}
try {
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  await choose(defaults);
  await size('2420 × 2868 px');
  for (const theme of ['light', 'dark']) {
    await capture(`input-${theme}.png`, 1440, theme);
    await capture(`input-mobile-${theme}.png`, 320, theme);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await choose(devices.map((d) => d.id));
  await size('3840 × 2868 px');
  await choose([devices[5].id]);
  await size('3840 × 2160 px');
  const phone = page.getByRole('checkbox', {
    name: devices[0].name,
    exact: true,
  });
  await phone.focus();
  await phone.press('Space');
  await size('3840 × 2868 px');
  assert.equal(
    await phone.evaluate((el) => el === el.getRootNode().activeElement),
    true,
  );
  assert.equal(
    await page
      .locator('.source-recommendation [role=status]')
      .getAttribute('aria-live'),
    'polite',
  );
  evidence.verified.push(
    'Default, all-device, landscape and independent maxima before upload; keyboard changes retain focus and polite status semantics',
  );
  await choose([]);
  await size('Select at least one device to see recommended dimensions');
  await saved([]);
  await page.reload();
  await size('Select at least one device to see recommended dimensions');
  await page
    .getByLabel('Choose wallpaper', { exact: true })
    .setInputFiles(
      fileURLToPath(new URL('../docs/images/dusk-ridges.png', import.meta.url)),
    );
  await settled();
  assert.equal(await page.locator('crop-editor').count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Next: Download' }).isDisabled(),
    true,
  );
  await choose([devices[3].id]);
  await settled();
  assert.equal(await page.locator('crop-editor').count(), 1);
  assert.equal(
    await page.getByRole('button', { name: 'Next: Download' }).isEnabled(),
    true,
  );
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await size('2560 × 1600 px');
  await saved([devices[3].id]);
  evidence.verified.push(
    'Empty choice persists across reload and permits real upload; Download gated; Processing selection initializes a crop and carries back through Start over',
  );
  await page.getByLabel('Choose wallpaper', { exact: true }).setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await page.waitForFunction(() => !!document.querySelector('shin-app').error);
  assert.equal(
    await page.evaluate(() => document.querySelector('shin-app').page),
    'input',
  );
  const small = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#aaaacc' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Choose wallpaper', { exact: true })
    .setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: small });
  await settled();
  assert.match(await page.locator('.warning').textContent(), /upscal/i);
  await page.getByRole('button', { name: 'Next: Download' }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Download ZIP', exact: true })
      .isEnabled(),
    true,
  );
  evidence.verified.push(
    'Corrupt-image rejection and retry; 64 × 64 source accepted, upscaling warning shown, completed output reaches Download',
  );
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await size('2560 × 1600 px');
  await choose(defaults);
  await saved(defaults);
  const disk = JSON.parse(
    await readFile(
      '/tmp/shin-wallslice-v160-review/data/preferences.json',
      'utf8',
    ),
  );
  assert.deepEqual(disk.devices.toSorted(), defaults.toSorted());
  evidence.verified.push(
    'Input choices written to existing flat-file preferences; review left on Input with default selections',
  );
  for (const theme of ['light', 'dark']) {
    await writeFile(
      new URL(`../docs/images/input-${theme}.png`, import.meta.url),
      await readFile(new URL(`input-${theme}.png`, output)),
    );
  }
  await writeFile(
    new URL('verification.json', output),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
