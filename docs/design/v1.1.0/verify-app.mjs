/* global document, innerWidth, structuredClone, getComputedStyle */
import { chromium } from '../../../packages/client/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} from '../../../packages/server/node_modules/@zip.js/zip.js/index.js';
const sharp = createRequire(import.meta.url)(
  '../../../packages/server/node_modules/sharp',
);
const root = new URL('./', import.meta.url);
const output = new URL('implemented/', root);
const source = new URL('../../../docs/images/dusk-ridges.png', import.meta.url);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
  acceptDownloads: true,
});
const appUrl = process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173';
const ids = ['iphone-18-pro-max', 'm5-ipad-pro-11-inch'];
const presets = JSON.parse(
  await readFile(
    new URL('../../../packages/server/src/devices.json', import.meta.url),
  ),
);
const captures = [];
const passed = [];
const state = () =>
  page.evaluate(() => {
    const a = document.querySelector('shin-app');
    return {
      page: a.page,
      ready: a.ready,
      busy: a.busy,
      dirty: a.dirty,
      job: a.job,
      crops: a.crops,
      prefs: a.prefs,
      manifest: a.manifest,
      name: a.name,
    };
  });
const settled = () =>
  page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a.manifest && !a.busy && !a.dirty;
  });
async function screenshots(screen) {
  for (const [viewport, width] of [
    ['desktop', 1440],
    ['mobile', 390],
    ['narrow', 320],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const appearance of ['light', 'dark']) {
      await page.emulateMedia({
        colorScheme: appearance,
        reducedMotion: 'reduce',
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() =>
        [
          ...document
            .querySelector('shin-app')
            .shadowRoot.querySelectorAll('img'),
        ].every((i) => i.complete && i.naturalWidth),
      );
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const root = document.querySelector('shin-app').shadowRoot;
        const controls = [
          ...root.querySelectorAll('wa-button,input[type=text],.crop-choice'),
        ];
        const bad = controls.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left < 0 || r.right > innerWidth + 0.5);
        });
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          current: root.querySelector('[aria-current=step]').textContent.trim(),
          bad: bad.map((e) => e.textContent),
        };
      });
      assert.equal(
        layout.overflow,
        false,
        `${screen}/${width}/${appearance} overflow`,
      );
      assert.deepEqual(
        layout.bad,
        [],
        `${screen}/${width}/${appearance} clipped controls`,
      );
      assert.ok(layout.current.toLowerCase().includes(screen));
      const file = `${screen}-${viewport}-${appearance}.png`;
      await page.screenshot({
        path: fileURLToPath(new URL(file, output)),
        fullPage: true,
      });
      if (viewport === 'desktop')
        await page.screenshot({
          path: fileURLToPath(
            new URL(
              `../../../docs/images/${screen}-${appearance}.png`,
              import.meta.url,
            ),
          ),
          fullPage: true,
        });
      captures.push(file);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'light' });
}
async function downloadButton(name, exact = false) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact }).first().click();
  const download = await pending;
  const data = await readFile(await download.path());
  await page.waitForFunction(() => !document.querySelector('shin-app').busy);
  return { name: download.suggestedFilename(), data };
}
async function zipCheck(folder, pngs) {
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .setChecked(folder);
  const download = await downloadButton('Download ZIP');
  assert.equal(download.name, 'dusk-ridges.zip');
  const reader = new ZipReader(new Uint8ArrayReader(download.data));
  const entries = (await reader.getEntries()).filter((e) => !e.directory);
  assert.equal(entries.length, 2);
  for (const id of ids) {
    const name = folder ? `${id}/dusk-ridges.png` : `dusk-ridges-${id}.png`;
    const entry = entries.find((e) => e.filename === name);
    assert.ok(entry, `ZIP entry ${name}`);
    assert.deepEqual(
      Buffer.from(await entry.getData(new Uint8ArrayWriter())),
      pngs[id],
    );
  }
  await reader.close();
}
async function outputs(s) {
  const pngs = {};
  for (const id of ids) {
    const response = await page.request.get(appUrl + s.manifest.outputs[id]);
    assert.equal(response.status(), 200);
    pngs[id] = await response.body();
    const d = presets.find((d) => d.id === id),
      m = await sharp(pngs[id]).metadata();
    assert.deepEqual([m.width, m.height, m.format], [d.width, d.height, 'png']);
  }
  return pngs;
}
try {
  await page.goto(appUrl);
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  await screenshots('input');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedStatus = await page.evaluate(async () => {
    const a = document.querySelector('shin-app');
    a.busy = 'Uploading…';
    await a.updateComplete;
    const spinner = a.shadowRoot.querySelector('wa-spinner');
    const result = {
      display: getComputedStyle(spinner).display,
      text: a.shadowRoot.querySelector('[role=status]').textContent,
    };
    a.busy = '';
    await a.updateComplete;
    return result;
  });
  assert.equal(reducedStatus.display, 'none');
  assert.ok(reducedStatus.text.includes('Uploading'));
  passed.push(
    'reduced-motion CSS hides animated indicators while retaining pending status text',
  );

  await page
    .getByLabel('Choose wallpaper', { exact: true })
    .setInputFiles(fileURLToPath(source));
  await settled();
  for (const d of presets)
    await page
      .getByRole('checkbox', { name: d.name, exact: true })
      .setChecked(ids.includes(d.id));
  await page.getByRole('radio', { name: 'center', exact: true }).check();
  await page
    .getByRole('checkbox', { name: 'True black shadows' })
    .setChecked(true);
  await page.getByLabel('Threshold:', { exact: false }).press('Home');
  for (let i = 0; i < 16; i++)
    await page.getByLabel('Threshold:', { exact: false }).press('ArrowRight');
  await page
    .getByRole('checkbox', { name: 'True black shadows' })
    .setChecked(false);
  await settled();
  await screenshots('processing');
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('dusk-ridges');
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .setChecked(false);
  await screenshots('download');
  passed.push(
    '18 real application captures; 1440/390/320 widths; initial light and live light/dark changes; current-stage markers and control bounds',
  );
  let s = await state();
  const centerOutputs = await outputs(s);
  const individual = await downloadButton('Download PNG', true);
  assert.equal(individual.name, 'dusk-ridges-iphone-18-pro-max.png');
  assert.deepEqual(individual.data, centerOutputs[ids[0]]);
  await zipCheck(false, centerOutputs);
  await zipCheck(true, centerOutputs);
  passed.push(
    'actual individual PNG download, exact dimensions, ZIP contents and names in both folder modes',
  );
  await page.getByRole('button', { name: 'Back to Processing' }).click();
  const previous = structuredClone((await state()).crops);
  const crop = page.getByRole('button', {
    name: /Move iPhone 18 Pro Max crop/,
  });
  await crop.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settled();
  s = await state();
  assert.equal(s.crops[ids[0]].left, previous[ids[0]].left + 11);
  assert.deepEqual(s.crops[ids[1]], previous[ids[1]]);
  await page
    .getByRole('button', { name: 'Reset position', exact: true })
    .first()
    .click();
  await settled();
  assert.deepEqual((await state()).crops, previous);
  await crop.focus();
  await page.keyboard.press('Shift+ArrowRight');
  const tablet = page.getByRole('button', {
    name: /Move M5 iPad Pro 11-inch crop/,
  });
  const box = await tablet.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await settled();
  const manual = structuredClone((await state()).crops);
  assert.notDeepEqual(manual[ids[1]], previous[ids[1]]);
  const regular = await outputs(await state());
  await page.getByRole('checkbox', { name: 'True black shadows' }).check();
  await page.getByLabel('Threshold:', { exact: false }).press('Home');
  for (let i = 0; i < 32; i++)
    await page.getByLabel('Threshold:', { exact: false }).press('ArrowRight');
  await settled();
  s = await state();
  assert.deepEqual(s.crops, manual);
  const oled = await outputs(s);
  let changed = 0;
  for (const id of ids) {
    const d = presets.find((d) => d.id === id);
    const expected = await sharp(fileURLToPath(source))
      .extract(manual[id])
      .resize(d.width, d.height, { fit: 'cover' })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer();
    const before = await sharp(regular[id]).ensureAlpha().raw().toBuffer();
    const after = await sharp(oled[id]).ensureAlpha().raw().toBuffer();
    assert.deepEqual(before, expected, `export framing ${id}`);
    for (let i = 0; i < before.length; i += 4) {
      const black = Math.max(before[i], before[i + 1], before[i + 2]) <= 32;
      for (let c = 0; c < 3; c++) {
        assert.equal(after[i + c], black ? 0 : before[i + c]);
        if (after[i + c] !== before[i + c]) changed++;
      }
      assert.equal(after[i + 3], before[i + 3]);
    }
  }
  assert.ok(changed > 0);
  passed.push(
    'independent keyboard and real pointer crop movement, per-device reset, exact framing pixels, OLEDify cutoff pixel-by-pixel and retained alpha',
  );
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await zipCheck(true, oled);
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('a'.repeat(100));
  await page.setViewportSize({ width: 320, height: 900 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    320,
  );
  await page.screenshot({
    path: fileURLToPath(new URL('long-name-320.png', output)),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Back to Processing' }).click();
  assert.equal((await state()).name, 'a'.repeat(100));
  assert.deepEqual((await state()).crops, manual);
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('shin-app').page === 'input',
  );
  const disposed = await page.request.get(appUrl + s.manifest.source);
  assert.equal(disposed.status(), 404);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  s = await state();
  assert.equal(s.page, 'input');
  assert.equal(s.prefs.oled, true);
  assert.equal(s.prefs.threshold, 32);
  assert.equal(s.prefs.organizeIntoDeviceFolders, true);
  passed.push(
    '100-character filename at 320px, Back preserves edits, Start over disposes files, preferences survive reload',
  );
  await writeFile(
    new URL('verification.json', output),
    JSON.stringify(
      {
        application: appUrl,
        ai: 'disabled for real source; AI states covered by Chromium component tests',
        captures,
        exportDimensions: presets
          .filter((d) => ids.includes(d.id))
          .map(({ id, width, height }) => ({ id, width, height })),
        oledChangedChannels: changed,
        passed,
      },
      null,
      2,
    ) + '\n',
  );
  await import('./build-gallery.mjs');
  console.log(JSON.stringify({ captures: captures.length, passed }, null, 2));
} finally {
  await browser.close();
}
