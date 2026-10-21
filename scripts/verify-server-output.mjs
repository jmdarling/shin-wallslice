/* global document, innerWidth */
import { chromium } from '../packages/client/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
const base = process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173';
const output = new URL('../docs/design/v1.2.0/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  colorScheme: 'light',
});
const evidence = { url: base, verified: [], captures: [] };
try {
  const response = await fetch(`${base}/api/catalog`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.serverSavingEnabled, true);
  const preferences = {
    ...catalog.preferences,
    devices: ['iphone-18-pro-max', 'm5-ipad-pro-11-inch'],
    method: 'anchor',
    anchor: 'center',
    oled: false,
    threshold: 16,
    organizeIntoDeviceFolders: false,
  };
  const updated = await fetch(`${base}/api/preferences`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  assert.equal(updated.status, 200);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  await page
    .locator('input[type=file]')
    .setInputFiles(
      fileURLToPath(new URL('../docs/images/dusk-ridges.png', import.meta.url)),
    );
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a.manifest && !a.busy && !a.dirty;
  });
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('dusk-ridges');
  await page.locator('input[type=text]').blur();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const appearance of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: appearance });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() =>
        [
          ...document
            .querySelector('shin-app')
            .shadowRoot.querySelectorAll('img'),
        ].every((i) => i.complete && i.naturalWidth),
      );
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        controls: [
          ...document
            .querySelector('shin-app')
            .shadowRoot.querySelectorAll('wa-button,input[type=text]'),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.left < 0 || r.right > innerWidth + 0.5;
          })
          .map((e) => e.textContent),
      }));
      assert.equal(layout.overflow, false);
      assert.deepEqual(layout.controls, []);
      const file = `download-${width}-${appearance}.png`;
      await page.screenshot({
        path: fileURLToPath(new URL(file, output)),
        fullPage: true,
      });
      evidence.captures.push(file);
      if (width === 1440)
        await page.screenshot({
          path: fileURLToPath(
            new URL(
              `../docs/images/download-${appearance}.png`,
              import.meta.url,
            ),
          ),
          fullPage: true,
        });
    }
  }
  evidence.verified.push(
    'Download controls fit 1440, 390, 320px in light/dark; real application captures refreshed.',
  );
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('shin-app').serverSave &&
      !document.querySelector('shin-app').busy,
  );
  if (
    await page.getByRole('button', { name: 'Replace', exact: true }).count()
  ) {
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('shin-app').serverSave?.state === 'saved',
    );
  }
  const result = await page.evaluate(() => {
    const a = document.querySelector('shin-app');
    return { save: a.serverSave, manifest: a.manifest, job: a.job };
  });
  assert.equal(result.save.state, 'saved');
  for (const [id, url] of Object.entries(result.manifest.outputs)) {
    const png = Buffer.from(
      await fetch(base + url).then((r) => r.arrayBuffer()),
    );
    assert.ok(
      png.equals(
        await readFile(`${result.save.destination}/dusk-ridges-${id}.png`),
      ),
    );
  }
  evidence.verified.push(
    'Actual UI save completed and every saved PNG equals its final-preview download byte for byte.',
  );
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL('conflicts-320-dark.png', output)),
    fullPage: true,
  });
  const before = await Promise.all(
    result.save.saved.map((path) =>
      readFile(`${result.save.destination}/${path}`),
    ),
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const [index, path] of result.save.saved.entries())
    assert.ok(
      before[index].equals(
        await readFile(`${result.save.destination}/${path}`),
      ),
    );
  evidence.verified.push(
    'Actual conflict list and Cancel preserved all saved bytes.',
  );
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .check();
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('shin-app').serverSave &&
      !document.querySelector('shin-app').busy,
  );
  if (
    await page.getByRole('button', { name: 'Replace', exact: true }).count()
  ) {
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('shin-app').serverSave?.state === 'saved',
    );
  }
  const organized = await page.evaluate(
    () => document.querySelector('shin-app').serverSave,
  );
  assert.equal(organized.state, 'saved');
  assert.ok(
    organized.saved.every((path) => /^[^/]+\/dusk-ridges\.png$/.test(path)),
  );
  for (const [id, url] of Object.entries(result.manifest.outputs))
    assert.ok(
      Buffer.from(await fetch(base + url).then((r) => r.arrayBuffer())).equals(
        await readFile(`${organized.destination}/${id}/dusk-ridges.png`),
      ),
    );
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.waitForFunction(
    () => document.querySelector('shin-app').page === 'input',
  );
  for (const path of organized.saved)
    assert.ok((await readFile(`${organized.destination}/${path}`)).length > 0);
  evidence.verified.push(
    'Organized UI save matches preview bytes; Start over retained outputs.',
  );
  await writeFile(
    new URL('verification.json', output),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
