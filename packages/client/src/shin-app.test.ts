import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import './shin-app.js';

afterEach(() => {
  document.body.replaceChildren();
});
test('renders the application identity and placeholder in Chromium', async () => {
  document.body.append(document.createElement('shin-app'));
  await expect
    .element(page.getByText('shin-wallslice', { exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole('heading', { name: 'One wallpaper. Every device.' }),
    )
    .toBeVisible();
  await expect
    .element(page.getByText('Foundation · v0.1.0', { exact: true }))
    .toBeVisible();
});
