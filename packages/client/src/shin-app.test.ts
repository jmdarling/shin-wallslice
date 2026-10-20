import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ShinApp } from './shin-app.js';
import { CropEditor } from './crop-editor.js';
import type { Crop } from '../../server/src/protocol.js';
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1kAAAAASUVORK5CYII=';
const devices = [
  { id: 'phone', name: 'Phone', width: 100, height: 200 },
  { id: 'tablet', name: 'Tablet', width: 200, height: 200 },
  { id: 'laptop', name: 'Laptop', width: 200, height: 100 },
];
const smart = {
  phone: { left: 250, top: 0, width: 100, height: 200 },
  tablet: { left: 200, top: 0, width: 200, height: 200 },
  laptop: { left: 100, top: 0, width: 400, height: 200 },
};
let failUpload = false;
let renderCount = 0;
let preferences = {
  devices: ['phone', 'tablet'],
  method: 'smart',
  anchor: 'center',
  oled: false,
  threshold: 16,
  organizeIntoDeviceFolders: false,
};
let renderBodies: {
  crops: Record<string, Crop>;
  oled: boolean;
  threshold: number;
}[] = [];
beforeEach(() => {
  failUpload = false;
  renderCount = 0;
  renderBodies = [];
  preferences = {
    devices: ['phone', 'tablet'],
    method: 'smart',
    anchor: 'center',
    oled: false,
    threshold: 16,
    organizeIntoDeviceFolders: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog')
        return Response.json({ devices, preferences, preferenceError: '' });
      if (input === '/api/preferences') {
        preferences = JSON.parse(init!.body as string);
        return Response.json(preferences);
      }
      if (input === '/api/jobs') {
        if (failUpload)
          return Response.json(
            { message: 'Corrupt image. Choose another image.' },
            { status: 400 },
          );
        return Response.json({ id: 'job', width: 600, height: 200, smart });
      }
      if (input.endsWith('/render')) {
        renderCount++;
        const body = JSON.parse(init!.body as string);
        renderBodies.push(body);
        return Response.json({
          revision: String(renderCount),
          source: pixel,
          outputs: Object.fromEntries(
            Object.keys(body.crops).map((id) => [id, pixel]),
          ),
        });
      }
      if (init?.method === 'DELETE') return Response.json({ ok: true });
      return new Response('download');
    }),
  );
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
async function app() {
  const a = document.createElement('shin-app') as ShinApp;
  document.body.append(a);
  await vi.waitFor(() => expect(a.ready).toBe(true));
  return a;
}
function file(name = 'view.png') {
  return new File(['image'], name, { type: 'image/png' });
}
function picker(a: ShinApp, files: File[]) {
  const input = a.shadowRoot!.querySelector(
    'input[type=file]',
  ) as HTMLInputElement;
  const data = new DataTransfer();
  files.forEach((f) => data.items.add(f));
  input.files = data.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
async function processed(a: ShinApp) {
  await vi.waitFor(() => expect(a.page).toBe('processing'));
  await vi.waitFor(() => expect(a.manifest).toBeDefined());
  await vi.waitFor(() => expect(a.busy).toBe(''));
  await a.updateComplete;
}
function checked(a: ShinApp, label: string) {
  const input = [...a.shadowRoot!.querySelectorAll('label')]
    .find((e) => e.textContent?.trim() === label)!
    .querySelector('input')!;
  input.click();
}

test('Input has a labeled picker and accepts one file, shows the source and selected editors', async () => {
  const a = await app();
  await expect
    .element(
      page.getByRole('heading', { name: 'One wallpaper. Every device.' }),
    )
    .toBeVisible();
  picker(a, [file()]);
  await processed(a);
  expect(a.name).toBe('view');
  expect(a.shadowRoot!.querySelectorAll('crop-editor')).toHaveLength(2);
  expect(a.shadowRoot!.querySelector('img')!.alt).toBe(
    'Source wallpaper preview',
  );
  expect(a.prefs.method).toBe('smart');
});
test('drop and clipboard paste each open Processing, multiple files and corrupt uploads allow retry', async () => {
  const a = await app();
  picker(a, [file(), file('second.png')]);
  await vi.waitFor(() => expect(a.error).toContain('one image'));
  expect(a.page).toBe('input');
  failUpload = true;
  picker(a, [file()]);
  await vi.waitFor(() => expect(a.error).toContain('Corrupt'));
  expect(a.page).toBe('input');
  failUpload = false;
  const transfer = new DataTransfer();
  transfer.items.add(file());
  a.shadowRoot!.querySelector('.drop')!.dispatchEvent(
    new DragEvent('drop', {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );
  await processed(a);
  const start = [...a.shadowRoot!.querySelectorAll('wa-button')].find(
    (e) => e.textContent === 'Start over',
  ) as HTMLElement;
  start.click();
  await vi.waitFor(() => expect(a.page).toBe('input'));
  await a.updateComplete;
  document.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: transfer, cancelable: true }),
  );
  await processed(a);
});
test('global anchors reset positions, manual edits remain independent, reset affects only one device, and OLED preserves positions', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  checked(a, 'top right');
  await a.updateComplete;
  expect(a.crops.phone!.left).toBe(500);
  expect(a.crops.tablet!.left).toBe(400);
  const editor = a.shadowRoot!.querySelector('crop-editor')!;
  editor.dispatchEvent(
    new CustomEvent('crop-change', {
      detail: { ...a.crops.phone, left: 300 },
      bubbles: true,
      composed: true,
    }),
  );
  editor.dispatchEvent(
    new CustomEvent('crop-commit', { bubbles: true, composed: true }),
  );
  expect(a.crops.tablet!.left).toBe(400);
  checked(a, 'Turn near-black colors into true black');
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(a.crops.phone!.left).toBe(300);
  expect(renderBodies.at(-1)!.oled).toBe(true);
  const reset = [...a.shadowRoot!.querySelectorAll('wa-button')].find(
    (e) => e.textContent?.trim() === 'Reset position',
  ) as HTMLElement;
  reset.click();
  expect(a.crops.phone!.left).toBe(500);
  expect(a.crops.tablet!.left).toBe(400);
  checked(a, 'Smart (entropy)');
  expect(a.crops.phone!.left).toBe(250);
});
test('selection gates Download; Back preserves name and positions; Start over retains preferences and a new element begins at Input', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  checked(a, 'Phone');
  checked(a, 'Tablet');
  await a.updateComplete;
  expect(a.shadowRoot!.textContent).toContain('Select at least one');
  const next = () =>
    [...a.shadowRoot!.querySelectorAll('wa-button')].find((e) =>
      e.textContent?.includes('Next:'),
    ) as HTMLElement & { disabled: boolean };
  expect(next().disabled).toBe(true);
  checked(a, 'Laptop');
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  await a.updateComplete;
  next().click();
  await vi.waitFor(() => expect(a.page).toBe('download'));
  await a.updateComplete;
  const name = a.shadowRoot!.querySelector(
    'input[type=text]',
  ) as HTMLInputElement;
  name.value = '../new:name';
  name.dispatchEvent(new Event('input'));
  await a.updateComplete;
  expect(a.shadowRoot!.textContent).toContain('new-name-laptop.png');
  const back = [...a.shadowRoot!.querySelectorAll('wa-button')].find((e) =>
    e.textContent?.includes('Back to Processing'),
  ) as HTMLElement;
  back.click();
  await a.updateComplete;
  expect(a.name).toBe('../new:name');
  expect(a.prefs.devices).toEqual(['laptop']);
  const start = [...a.shadowRoot!.querySelectorAll('wa-button')].find(
    (e) => e.textContent === 'Start over',
  ) as HTMLElement;
  start.click();
  await vi.waitFor(() => expect(a.page).toBe('input'));
  expect(a.name).toBe('');
  expect(a.manifest).toBeUndefined();
  expect(a.prefs.devices).toEqual(['laptop']);
  a.remove();
  const b = await app();
  expect(b.page).toBe('input');
  expect(b.prefs.devices).toEqual(['laptop']);
  expect(b.job).toBeUndefined();
});
test('folder checkbox changes ZIP layout without regenerating, keeps PNG names and persists through navigation and reload', async () => {
  const downloads: string[] = [];
  const anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  try {
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    checked(a, 'Turn near-black colors into true black');
    const editor = a.shadowRoot!.querySelector('crop-editor')!;
    editor.dispatchEvent(
      new CustomEvent('crop-change', {
        detail: { ...a.crops.phone, left: 300 },
        bubbles: true,
        composed: true,
      }),
    );
    editor.dispatchEvent(
      new CustomEvent('crop-commit', { bubbles: true, composed: true }),
    );
    await vi.waitFor(() => expect(a.dirty).toBe(false));
    await page.getByRole('button', { name: 'Next: Download' }).click();
    const checkbox = page.getByRole('checkbox', {
      name: 'Organize into device folders',
    });
    await expect.element(checkbox).not.toBeChecked();
    await page
      .getByRole('textbox', { name: 'Wallpaper name' })
      .fill('../edited:name');
    const crops = structuredClone(a.crops);
    const manifest = a.manifest;
    const renders = renderCount;
    await page.getByRole('button', { name: 'Download all:' }).click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('organizeIntoDeviceFolders=false'),
    );
    (
      a.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement
    ).focus();
    await userEvent.keyboard(' ');
    await expect.element(checkbox).toBeChecked();
    await vi.waitFor(() =>
      expect(preferences.organizeIntoDeviceFolders).toBe(true),
    );
    await page.getByRole('button', { name: 'Download all:' }).click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'name=edited-name&organizeIntoDeviceFolders=true',
      ),
    );
    await page
      .getByRole('button', { name: 'Download PNG', exact: true })
      .first()
      .click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    expect(downloads).toEqual([
      'edited-name.zip',
      'edited-name.zip',
      'edited-name-phone.png',
    ]);
    expect(a.crops).toEqual(crops);
    expect(a.manifest).toBe(manifest);
    expect(a.prefs.oled).toBe(true);
    expect(renderCount).toBe(renders);
    await page.getByRole('button', { name: 'Back to Processing' }).click();
    expect(a.name).toBe('../edited:name');
    await page.getByRole('button', { name: 'Next: Download' }).click();
    await expect.element(checkbox).toBeChecked();
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    await vi.waitFor(() => expect(a.page).toBe('input'));
    await a.updateComplete;
    picker(a, [file('new.png')]);
    await processed(a);
    await page.getByRole('button', { name: 'Next: Download' }).click();
    await expect.element(checkbox).toBeChecked();
    a.remove();
    const b = await app();
    picker(b, [file()]);
    await processed(b);
    await page.getByRole('button', { name: 'Next: Download' }).click();
    await expect.element(checkbox).toBeChecked();
    await checkbox.click();
    await vi.waitFor(() =>
      expect(preferences.organizeIntoDeviceFolders).toBe(false),
    );
  } finally {
    anchorClick.mockRestore();
  }
});

test('crop editor clamps pointer and keyboard movement, keeps fixed size, and accepts touch pointers', async () => {
  const e = document.createElement('crop-editor') as CropEditor;
  e.source = pixel;
  e.imageWidth = 600;
  e.imageHeight = 200;
  e.crop = { left: 250, top: 0, width: 100, height: 200 };
  document.body.append(e);
  await e.updateComplete;
  const button = e.shadowRoot!.querySelector('button')!;
  button.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }),
  );
  await e.updateComplete;
  expect(e.crop.left).toBe(260);
  expect([e.crop.width, e.crop.height]).toEqual([100, 200]);
  // Synthetic pointer capture requires a live pointer in browsers; stub capture only, exercise real coordinates and clamping.
  button.setPointerCapture = () => {};
  button.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    }),
  );
  button.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 10000,
      clientY: 10000,
    }),
  );
  button.dispatchEvent(
    new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch' }),
  );
  await e.updateComplete;
  expect(e.crop).toEqual({ left: 500, top: 0, width: 100, height: 200 });
});
test('rapid OLED changes never commit an older render response or enable stale downloads', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  const original = fetch;
  let resolve: ((r: Response) => void) | undefined;
  let intercepted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/render') && !intercepted) {
        intercepted = true;
        return new Promise<Response>((r) => {
          resolve = r;
        });
      }
      return original(path, init);
    }),
  );
  checked(a, 'Turn near-black colors into true black');
  await vi.waitFor(() => expect(resolve).toBeDefined());
  const slider = a.shadowRoot!.querySelector(
    'input[type=range]',
  ) as HTMLInputElement;
  slider.value = '42';
  slider.dispatchEvent(new Event('input'));
  await a.updateComplete;
  expect(a.dirty).toBe(true);
  resolve!(
    Response.json({
      revision: 'old',
      source: pixel,
      outputs: { phone: pixel, tablet: pixel },
    }),
  );
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(a.manifest!.revision).not.toBe('old');
  expect(renderBodies.at(-1)!.threshold).toBe(42);
});
