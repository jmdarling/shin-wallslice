/* global document, innerWidth */
import { chromium } from '../packages/client/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const evidence = {
  url: process.env.WALLSLICE_REVIEW_URL || 'http://127.0.0.1:5173',
  captures: [],
  layouts: [],
};
try {
  await page.goto(evidence.url);
  await page.waitForFunction(() => document.querySelector('shin-app')?.ready);
  // Keep capture preferences local to this browser; no writes to shared preferences.
  await page.evaluate(() => {
    const a = document.querySelector('shin-app');
    a.prefs = {
      ...a.prefs,
      devices: ['iphone-18-pro-max', 'm5-ipad-pro-11-inch'],
      method: 'anchor',
      anchor: 'center',
      organizeIntoDeviceFolders: false,
    };
  });
  await page
    .locator('input[type=file]')
    .setInputFiles(`${root}/docs/images/dusk-ridges.png`);
  await page.waitForFunction(() => {
    const a = document.querySelector('shin-app');
    return a.manifest && !a.busy && !a.dirty;
  });
  const job = await page.evaluate(() => {
    const a = document.querySelector('shin-app');
    if (!a.oledAnalysis) throw Error('Updated OLED analysis missing');
    return { id: a.job.id, analysis: a.oledAnalysis };
  });
  evidence.initial = job.analysis;
  for (const stage of ['processing', 'download']) {
    if (stage === 'download')
      await page.getByRole('button', { name: 'Next: Download' }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const appearance of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: appearance });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          controls: [
            ...document
              .querySelector('shin-app')
              .shadowRoot.querySelectorAll('wa-button,input'),
          ]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width && (r.left < 0 || r.right > innerWidth + 1);
            })
            .map((e) => e.textContent),
        }));
        if (layout.overflow || layout.controls.length)
          throw Error(JSON.stringify({ stage, width, appearance, layout }));
        const name = `${stage}-${width}-${appearance}.png`;
        await page.screenshot({
          path: `${root}/docs/design/v1.3.0/${name}`,
          fullPage: true,
        });
        if (width === 1440)
          await page.screenshot({
            path: `${root}/docs/images/${stage}-${appearance}.png`,
            fullPage: true,
          });
        evidence.captures.push(name);
        evidence.layouts.push({ stage, width, appearance, ...layout });
      }
    }
  }
  const r = await fetch(`${evidence.url}/api/jobs/${job.id}/oled-analysis`);
  evidence.final = await r.json();
  await writeFile(
    `${root}/docs/design/v1.3.0/ui-review.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await fetch(`${evidence.url}/api/jobs/${job.id}`, { method: 'DELETE' });
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
