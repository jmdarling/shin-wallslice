/* global document, innerWidth */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { chromium } from '../packages/client/node_modules/playwright/index.mjs';
const base = process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173';
const output = new URL('../docs/design/v1.7.0/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const evidence = { url: base, verified: [], captures: [] };
async function settled() {
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a?.manifest && !a.busy && !a.dirty;
  });
}
async function capture(name, width = 1440, theme = 'light') {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.querySelector('shin-app').updateComplete;
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const dock = page.locator('.activity-dock');
  const box = await dock.boundingBox();
  assert(box.x >= 0 && box.x + box.width <= width && box.height <= 1000);
  await page.screenshot({
    path: new URL(name, output).pathname,
    fullPage: true,
  });
  evidence.captures.push(name);
}
async function compact() {
  const b = page.locator('.activity-summary');
  if ((await b.getAttribute('aria-expanded')) === 'true') await b.click();
}
async function expand() {
  await page.evaluate(() => {
    const a = document.querySelector('shin-app');
    const button = a.shadowRoot.querySelector('.activity-summary');
    if (a.activity.expanded) button.click();
    button.click();
  });
}

try {
  await page.goto(base);
  await page
    .getByRole('checkbox', { name: 'iPhone 18 Pro Max', exact: true })
    .waitFor();
  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  assert.equal(catalog.aiEnabled, false);
  for (const device of catalog.devices)
    await page
      .getByRole('checkbox', { name: device.name, exact: true })
      .setChecked(catalog.devices.slice(0, 2).some((d) => d.id === device.id));
  await compact();
  for (const theme of ['light', 'dark']) {
    await capture(`input-${theme}.png`, 1440, theme);
    await copyFile(
      new URL(`input-${theme}.png`, output),
      new URL(`../docs/images/input-${theme}.png`, import.meta.url),
    );
  }
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image'),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('shin-app')
      .activity.entries.some((e) => e.state === 'failed'),
  );
  assert.equal(
    await page.locator('.activity-summary').getAttribute('aria-expanded'),
    'false',
  );
  await expand();
  await page.getByRole('button', { name: 'Choose another image' }).waitFor();
  assert.equal(
    await page.locator('.activity-summary').getAttribute('aria-expanded'),
    'true',
  );
  evidence.verified.push(
    'Real invalid upload stays collapsed and exposes recovery after manual expansion',
  );
  await page
    .locator('input[type=file]')
    .setInputFiles(
      new URL('../docs/images/dusk-ridges.png', import.meta.url).pathname,
    );
  await settled();
  assert.equal(await page.locator('.message,.progress,.oled-toast').count(), 0);
  await compact();
  for (const theme of ['light', 'dark']) {
    await capture(`processing-${theme}.png`, 1440, theme);
    await copyFile(
      new URL(`processing-${theme}.png`, output),
      new URL(`../docs/images/processing-${theme}.png`, import.meta.url),
    );
    await capture(`processing-mobile-${theme}.png`, 320, theme);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Controlled local render delay keeps real processing in flight for a capture.
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route('**/render', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('checkbox', { name: 'True black shadows' }).check();
  await page.locator('input[type=range]').fill('40');
  await compact();
  await page
    .locator('.activity-summary wa-spinner')
    .waitFor({ state: 'attached' });
  assert.equal(
    await page.locator('.activity-summary').getAttribute('aria-expanded'),
    'false',
  );
  await capture('oledify-working.png');
  await copyFile(
    new URL('oledify-working.png', output),
    new URL('../docs/images/oledify-working.png', import.meta.url),
  );
  await expand();
  release();
  await settled();
  await page.unroute('**/render');
  evidence.verified.push(
    'Real rendering updates one dock entry; old notification surfaces absent',
  );
  await page.route('**/api/preferences', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Controlled preference failure. Please retry.',
      }),
    }),
  );
  await page
    .getByRole('checkbox', { name: 'M5 iPad Pro 13-inch', exact: true })
    .check();
  await settled();
  await expand();
  await page
    .getByRole('button', { name: 'Retry saving preferences' })
    .waitFor();
  await capture('preference-error-mobile.png', 320, 'dark');
  await page
    .getByRole('button', {
      name: 'Dismiss Preferences weren’t saved or restored',
      exact: true,
    })
    .click();
  assert.match(
    await page.locator('.activity-summary').textContent(),
    /attention/,
  );
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('shin-app').page === 'input',
  );
  await expand();
  await page
    .getByRole('button', { name: 'Retry saving preferences' })
    .waitFor();
  assert.equal(await page.locator('[data-activity=render]').count(), 0);
  await page.unroute('**/api/preferences');
  await page.getByRole('button', { name: 'Retry saving preferences' }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('shin-app')
        .activity.entries.find((e) => e.id === 'preferences')?.state ===
      'completed',
  );
  evidence.verified.push(
    'Dismissed app error survives Start over, wallpaper history clears, correct retry resolves failure',
  );
  await page
    .getByRole('checkbox', { name: 'M5 iPad Pro 13-inch', exact: true })
    .uncheck();
  await page
    .locator('input[type=file]')
    .setInputFiles(
      new URL('../docs/images/dusk-ridges.png', import.meta.url).pathname,
    );
  await settled();
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await compact();
  for (const theme of ['light', 'dark']) {
    await capture(`download-${theme}.png`, 1440, theme);
    await copyFile(
      new URL(`download-${theme}.png`, output),
      new URL(`../docs/images/download-${theme}.png`, import.meta.url),
    );
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click();
  await download;
  await expand();
  await page
    .locator('[data-activity=download][data-state=completed]')
    .waitFor();
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('dock-verification');
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('shin-app').serverSave,
  );
  // A prior verification run may already have these files. Review explicitly before replacing.
  if (
    (await page.evaluate(
      () => document.querySelector('shin-app').serverSave.state,
    )) === 'conflicts'
  ) {
    await page.getByText('View save details', { exact: true }).click();
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
  }
  await page.waitForFunction(
    () => document.querySelector('shin-app').serverSave?.state === 'saved',
  );
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await page
    .locator('[data-activity=server-save][data-state=attention]')
    .waitFor();
  const detail = page.locator('[data-activity=server-save] details');
  if (!(await detail.getAttribute('open')))
    await detail.locator('summary').click();
  await capture('server-conflict-mobile.png', 320, 'light');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  evidence.verified.push(
    'Real ZIP handoff, successful server save, explicit conflict list and cancellation',
  );
  await page.reload();
  await page.waitForFunction(() => document.querySelector('shin-app').ready);
  assert.equal(await page.locator('[data-activity=server-save]').count(), 0);
  evidence.verified.push('Reload does not restore activity history');
  assert.deepEqual(errors, []);
  evidence.verified.push(
    'No browser runtime errors; 320px and desktop light/dark layouts fit',
  );
  await writeFile(
    new URL('verification.json', output),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
