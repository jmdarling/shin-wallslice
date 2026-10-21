import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ShinApp } from './shin-app.js';
import '@awesome.me/webawesome/dist/styles/webawesome.css';
import './style.css';
import { followBrowserTheme } from './theme.js';
import { CropEditor } from './crop-editor.js';
import type {
  NamingStatus,
  Crop,
  OledAnalysis,
} from '../../server/src/protocol.js';
const nativeFetch = globalThis.fetch;
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
let stopTheme: (() => void) | undefined;
let oledInitial: OledAnalysis | undefined;
let oledResponse: () => Promise<Response> = async () => Response.json({});
let namingEnabled = false;
let namingResponse: () => Promise<Response> = async () =>
  Response.json({ state: 'disabled' });
let detectionResponse: () => Promise<Response> = async () =>
  Response.json({ state: 'disabled' });
let failUpload = false;
let serverSavingEnabled = false;
let saveBodies: Record<string, unknown>[] = [];
let saveResponse: () => Promise<Response> = async () => Response.json({});
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
  oledInitial = undefined;
  oledResponse = async () => Response.json({});
  namingEnabled = false;
  serverSavingEnabled = false;
  saveBodies = [];
  saveResponse = async () =>
    Response.json({
      state: 'saved',
      destination: '/data/output',
      saved: ['view-phone.png', 'view-tablet.png'],
      conflicts: [],
      failed: [],
    });
  detectionResponse = async () => Response.json({ state: 'disabled' });
  namingResponse = async () => Response.json({ state: 'disabled' });
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
      if (input.endsWith('.svg') || input.startsWith('data:image/svg+xml'))
        return nativeFetch(input, init);
      if (input === '/api/catalog')
        return Response.json({
          devices,
          preferences,
          preferenceError: '',
          aiEnabled: namingEnabled,
          serverSavingEnabled,
        });
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
        return Response.json({
          oledAnalysis: oledInitial,
          id: 'job',
          width: 600,
          height: 200,
          smart,
          naming: { state: namingEnabled ? 'pending' : 'disabled' },
          detection: { state: namingEnabled ? 'pending' : 'disabled' },
        });
      }
      if (input.endsWith('/oled-analysis')) return oledResponse();
      if (input.endsWith('/detection')) return detectionResponse();
      if (input.includes('/save/')) {
        saveBodies.push(
          JSON.parse(init!.body as string) as Record<string, unknown>,
        );
        return saveResponse();
      }
      if (input.endsWith('/naming')) return namingResponse();
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
  stopTheme?.();
  document.documentElement.classList.remove('wa-dark', 'wa-light');
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

for (const width of [320, 390, 1440]) {
  test(`workflow location and long download names remain usable at ${width}px`, async () => {
    await page.viewport(width, 900);
    devices[0]!.name = 'Phone with an unusually long display and device name';
    try {
      const a = await app();
      const verifyStage = (stage: string) => {
        const current = a.shadowRoot!.querySelectorAll('[aria-current=step]');
        expect(current).toHaveLength(1);
        expect(current[0]!.textContent).toContain(stage);
        expect(document.documentElement.scrollWidth).toBe(width);
      };
      verifyStage('Input');
      picker(a, [file()]);
      await processed(a);
      verifyStage('Processing');
      expect(a.shadowRoot!.querySelector('h1')!.className).toBe('sr-only');
      await page.getByRole('button', { name: 'Next: Download' }).click();
      await page
        .getByRole('textbox', { name: 'Wallpaper name' })
        .fill('a'.repeat(100));
      await a.updateComplete;
      verifyStage('Download');
      expect(a.shadowRoot!.querySelector('h1')!.className).toBe('sr-only');
      for (const control of a.shadowRoot!.querySelectorAll('wa-button')) {
        const rect = control.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'Back to Processing' }).click();
      await a.updateComplete;
      verifyStage('Processing');
    } finally {
      devices[0]!.name = 'Phone';
      await page.viewport(1280, 900);
    }
  });
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
  expect(a.prefs.method).toBe('entropy');
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
  checked(a, 'True black shadows');
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(a.crops.phone!.left).toBe(300);
  expect(renderBodies.at(-1)!.oled).toBe(true);
  const reset = [...a.shadowRoot!.querySelectorAll('wa-button')].find(
    (e) => e.textContent?.trim() === 'Reset position',
  ) as HTMLElement;
  reset.click();
  expect(a.crops.phone!.left).toBe(500);
  expect(a.crops.tablet!.left).toBe(400);
  await page
    .getByRole('radio', { name: 'Smart (entropy)', exact: true })
    .click();
  expect(a.crops.phone!.left).toBe(250);
});
test('spatial crop radios expose names, select every anchor directly, and support native keyboard navigation', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  const names = [
    'Smart (entropy)',
    'top left',
    'top right',
    'center',
    'bottom left',
    'bottom right',
  ];
  const radios = () => [
    ...a.shadowRoot!.querySelectorAll<HTMLInputElement>('input[name=method]'),
  ];
  expect(radios()).toHaveLength(6);
  await expect
    .element(page.getByRole('radio', { name: 'Smart (entropy)', exact: true }))
    .toBeChecked();
  for (const [index, name] of names.entries()) {
    const radio = page.getByRole('radio', { name, exact: true });
    await radio.click();
    await a.updateComplete;
    await expect.element(radio).toBeChecked();
    expect(radios().filter((r) => r.checked)).toEqual([radios()[index]]);
    const horizontal = name.includes('left')
      ? 0
      : name.includes('right')
        ? 1
        : 0.5;
    expect(a.crops.phone).toEqual(
      name === 'Smart (entropy)'
        ? smart.phone
        : { ...smart.phone, left: 500 * horizontal },
    );
    expect(a.crops.tablet).toEqual(
      name === 'Smart (entropy)'
        ? smart.tablet
        : { ...smart.tablet, left: 400 * horizontal },
    );
  }
  await page
    .getByRole('radio', { name: 'Smart (entropy)', exact: true })
    .click();
  expect(a.prefs.anchor).toBe('bottom-right');
  expect(radios().filter((r) => r.checked)).toEqual([radios()[0]]);
  radios()[0]!.focus();
  for (const name of [...names.slice(1), 'Smart (entropy)']) {
    await userEvent.keyboard('{ArrowRight}');
    await a.updateComplete;
    await expect
      .element(page.getByRole('radio', { name, exact: true }))
      .toBeChecked();
    expect(radios().filter((r) => r.checked)).toHaveLength(1);
    const focused = a.shadowRoot!.activeElement as HTMLInputElement;
    expect(focused.checked).toBe(true);
    expect(getComputedStyle(focused.closest('label')!).outlineStyle).toBe(
      'solid',
    );
  }
  expect(a.crops).toEqual({ phone: smart.phone, tablet: smart.tablet });
  // Newly selected devices also use the current global choice.
  await page.getByRole('radio', { name: 'bottom right', exact: true }).click();
  checked(a, 'Laptop');
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(a.crops.laptop).toEqual({ ...smart.laptop, left: 200 });
  expect(renderBodies.at(-1)!.crops).toEqual(a.crops);
});

for (const choice of [
  'smart',
  'top-left',
  'top-right',
  'center',
  'bottom-left',
  'bottom-right',
]) {
  test(`restores ${choice} crop preference across navigation, Start over, new uploads and reload`, async () => {
    preferences.method = choice === 'smart' ? 'smart' : 'anchor';
    preferences.anchor = choice === 'smart' ? 'bottom-right' : choice;
    let a = await app();
    const verify = async () => {
      await a.updateComplete;
      const selected = page.getByRole('radio', {
        name: choice === 'smart' ? 'Smart (entropy)' : choice.replace('-', ' '),
        exact: true,
      });
      await expect.element(selected).toBeChecked();
      expect(
        a.shadowRoot!.querySelectorAll('input[name=method]:checked'),
      ).toHaveLength(1);
    };
    picker(a, [file()]);
    await processed(a);
    await verify();
    await page.getByRole('button', { name: 'Next:' }).click();
    await page.getByRole('button', { name: 'Back to Processing' }).click();
    await verify();
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    await vi.waitFor(() => expect(a.page).toBe('input'));
    picker(a, [file('another.png')]);
    await processed(a);
    await verify();
    a.remove();
    a = await app();
    picker(a, [file()]);
    await processed(a);
    await verify();
  });
}

for (const theme of ['light', 'dark']) {
  for (const width of [280, 320, 390, 680, 1280]) {
    test(`crop targets fit at ${width}px in ${theme} mode with non-color selection cues`, async () => {
      await page.viewport(width, 900);
      document.documentElement.classList.add(`wa-${theme}`);
      try {
        const a = await app();
        picker(a, [file()]);
        await processed(a);
        const root = a.shadowRoot!;
        const panel = root.querySelector('.panel')!.getBoundingClientRect();
        const labels = [...root.querySelectorAll<HTMLElement>('.crop-choice')];
        const smartRect = root
          .querySelector('.smart-choice')!
          .getBoundingClientRect();
        const anchorsRect = root
          .querySelector('.anchors')!
          .getBoundingClientRect();
        // Smart methods are full-width rows; anchors remain a spatial grid.
        expect(smartRect.width).toBeGreaterThanOrEqual(anchorsRect.width);
        expect(smartRect.bottom).toBeLessThan(anchorsRect.top);
        expect(root.querySelector('.smart-label small')!.textContent).toBe(
          '(entropy)',
        );

        for (const label of labels) {
          const rect = label.getBoundingClientRect();
          expect(rect.width).toBeGreaterThanOrEqual(44);
          expect(rect.height).toBeGreaterThanOrEqual(44);
          expect(rect.left).toBeGreaterThanOrEqual(panel.left);
          expect(rect.right).toBeLessThanOrEqual(panel.right);
          for (const other of labels.filter((l) => l !== label)) {
            const b = other.getBoundingClientRect();
            expect(
              rect.right <= b.left ||
                rect.left >= b.right ||
                rect.bottom <= b.top ||
                rect.top >= b.bottom,
            ).toBe(true);
          }
        }
        expect(document.documentElement.scrollWidth).toBe(width);
        const smartLabel = root.querySelector('.smart-choice')!;
        expect(getComputedStyle(smartLabel, '::after').content).toBe('"✓"');
        await page.getByRole('radio', { name: 'center', exact: true }).click();
        await a.updateComplete;
        expect(getComputedStyle(smartLabel, '::after').content).toBe('none');
        expect(
          getComputedStyle(root.querySelector('.center')!, '::after').content,
        ).toBe('"✓"');
      } finally {
        await page.viewport(1280, 900);
      }
    });
  }
}

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
    checked(a, 'True black shadows');
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
    await page.getByRole('button', { name: 'Download ZIP' }).click();
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
    await page.getByRole('button', { name: 'Download ZIP' }).click();
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
  checked(a, 'True black shadows');
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

function threshold(a: ShinApp, value: number) {
  const slider = a.shadowRoot!.querySelector('#threshold') as HTMLInputElement;
  slider.value = String(value);
  slider.dispatchEvent(new Event('input'));
}

test('threshold toast spans debounce and successive renders, preserves crops and commits only the latest previews and outputs', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  const original = fetch;
  const pending: ((r: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/render')) {
        renderBodies.push(JSON.parse(init!.body as string));
        return new Promise<Response>((resolve) => pending.push(resolve));
      }
      return original(path, init);
    }),
  );
  const toast = () => a.shadowRoot!.querySelector('.oled-toast');
  checked(a, 'True black shadows');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(toast()).toBeNull();
  const crops = structuredClone(a.crops);
  const manifest = a.manifest;
  threshold(a, 42);
  await a.updateComplete;
  expect(toast()?.textContent).toContain('OLEDify processing');
  expect(toast()?.getAttribute('role')).toBe('status');
  expect(toast()?.querySelector('wa-spinner')).not.toBeNull();
  expect(getComputedStyle(toast()!).pointerEvents).toBe('none');
  const bounds = toast()!.getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  pending[0]!(Response.json({ revision: 'old', source: pixel, outputs: {} }));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(a.manifest).toBe(manifest);
  expect(toast()).not.toBeNull();
  threshold(a, 99);
  await a.updateComplete;
  pending[1]!(Response.json({ revision: 'older', source: pixel, outputs: {} }));
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  expect(a.shadowRoot!.querySelectorAll('.oled-toast')).toHaveLength(1);
  expect(a.manifest).toBe(manifest);
  expect(renderBodies.at(-1)).toEqual({ crops, oled: true, threshold: 99 });
  const latest = {
    revision: 'latest',
    source: `${pixel}#latest`,
    outputs: { phone: `${pixel}#phone`, tablet: `${pixel}#tablet` },
  };
  pending[2]!(Response.json(latest));
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  await a.updateComplete;
  expect(toast()).toBeNull();
  expect(a.crops).toEqual(crops);
  expect(a.manifest).toEqual(latest);
  expect(a.shadowRoot!.querySelector<HTMLImageElement>('.source')!.src).toBe(
    latest.source,
  );
  for (const editor of a.shadowRoot!.querySelectorAll<CropEditor>(
    'crop-editor',
  )) {
    expect(editor.source).toBe(latest.source);
  }
  await page.getByRole('button', { name: 'Next: Download' }).click();
  expect(
    [...a.shadowRoot!.querySelectorAll<HTMLImageElement>('.output')].map(
      (img) => img.src,
    ),
  ).toEqual(Object.values(latest.outputs));
});

test('latest threshold failure clears the toast and exposes error and working Retry', async () => {
  oledInitial = {
    state: 'local',
    candidate: true,
    oled: true,
    threshold: 16,
    evaluated: [],
    darkPercentage: 50,
  };
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  const original = fetch;
  let resolve: ((r: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/render') && !resolve)
        return new Promise<Response>((r) => {
          resolve = r;
        });
      return original(path, init);
    }),
  );
  threshold(a, 80);
  await a.updateComplete;
  expect(a.shadowRoot!.querySelector('.oled-toast')).not.toBeNull();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  resolve!(
    Response.json(
      { message: 'Processing failed. Please retry.' },
      { status: 500 },
    ),
  );
  await vi.waitFor(() => expect(a.error).toContain('Processing failed'));
  await a.updateComplete;
  expect(a.shadowRoot!.querySelector('.oled-toast')).toBeNull();
  expect(a.dirty).toBe(true);
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Processing failed');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(a.error).toBe('');
  expect(renderBodies.at(-1)!.threshold).toBe(80);
});

function browserTheme(dark: boolean) {
  const preference = new EventTarget();
  Object.assign(preference, {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
  });
  vi.stubGlobal('matchMedia', () => preference);
  stopTheme = followBrowserTheme();
  return (next: boolean) => {
    Object.assign(preference, { matches: next });
    preference.dispatchEvent(new Event('change'));
  };
}

for (const dark of [false, true]) {
  test(`initial ${dark ? 'dark' : 'light'} preference styles the first application render and native controls`, async () => {
    browserTheme(dark);
    const a = await app();
    expect(document.documentElement.classList.contains('wa-dark')).toBe(dark);
    expect(getComputedStyle(a).color).toBe(
      dark ? 'rgb(244, 240, 255)' : 'rgb(41, 36, 56)',
    );
    expect(
      getComputedStyle(a.shadowRoot!.querySelector('input')!).colorScheme,
    ).toBe(dark ? 'dark' : 'light');
    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(
      dark ? 'rgb(32, 30, 42)' : 'rgb(241, 240, 247)',
    );
  });
}

for (const detection of ['no preference', 'unavailable', 'throws']) {
  test(`theme falls back to light when preference detection is ${detection}`, async () => {
    browserTheme(true);
    stopTheme!();
    vi.stubGlobal(
      'matchMedia',
      detection === 'unavailable'
        ? undefined
        : detection === 'throws'
          ? () => {
              throw new Error('Unsupported');
            }
          : () => Object.assign(new EventTarget(), { matches: false }),
    );
    stopTheme = followBrowserTheme();
    const a = await app();
    expect(document.documentElement.classList.contains('wa-dark')).toBe(false);
    expect(getComputedStyle(a).colorScheme).toBe('light');
  });
}

test('live theme changes preserve pending uploads, edited crops, OLED settings, pending renders, navigation, name and folder choice', async () => {
  const changeTheme = browserTheme(false);
  const a = await app();
  const original = fetch;
  let finishUpload: (() => void) | undefined;
  let finishRender: (() => void) | undefined;
  let holdRender = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/jobs')
        await new Promise<void>((resolve) => {
          finishUpload = resolve;
        });
      if (path.endsWith('/render') && holdRender)
        await new Promise<void>((resolve) => {
          finishRender = resolve;
        });
      return original(path, init);
    }),
  );
  picker(a, [file()]);
  await vi.waitFor(() => expect(finishUpload).toBeDefined());
  changeTheme(true);
  expect(a.busy).toContain('Uploading');
  finishUpload!();
  await processed(a);
  checked(a, 'top right');
  checked(a, 'True black shadows');
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
  holdRender = true;
  threshold(a, 42);
  await vi.waitFor(() => expect(finishRender).toBeDefined());
  const crops = structuredClone(a.crops);
  const prefs = structuredClone(a.prefs);
  const job = a.job;
  const requests = vi.mocked(fetch).mock.calls.length;
  changeTheme(false);
  changeTheme(true);
  expect(a.oledProcessing).toBe(true);
  expect(a.crops).toEqual(crops);
  expect(a.prefs).toEqual(prefs);
  expect(a.job).toBe(job);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
  finishRender!();
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await page
    .getByRole('textbox', { name: 'Wallpaper name' })
    .fill('edited-name');
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .click();
  const manifest = a.manifest;
  const image = a.shadowRoot!.querySelector<HTMLImageElement>('.output')!;
  const src = image.src;
  changeTheme(false);
  await a.updateComplete;
  expect(a.page).toBe('download');
  expect(a.name).toBe('edited-name');
  expect(a.prefs.organizeIntoDeviceFolders).toBe(true);
  expect(a.crops).toEqual(crops);
  expect(a.manifest).toBe(manifest);
  expect(image.src).toBe(src);
  expect(getComputedStyle(image).filter).toBe('none');
  await page.getByRole('button', { name: 'Back to Processing' }).click();
  expect(getComputedStyle(a).colorScheme).toBe('light');
  changeTheme(true);
  expect(getComputedStyle(a).colorScheme).toBe('dark');
  expect(a.crops).toEqual(crops);
  expect(a.prefs).toEqual({ ...prefs, organizeIntoDeviceFolders: true });
  stopTheme!();
  changeTheme(false);
  expect(document.documentElement.classList.contains('wa-dark')).toBe(true);
});

// Include translucent light surfaces in the measured contrast rather than
// comparing their uncomposited CSS values against text and control colors.
function themeContrast(foreground: string, background: string) {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => {
    const hex = style.getPropertyValue(`--app-${name}`).trim().slice(1);
    return [0, 2, 4, 6].map((offset) =>
      offset === 6 && hex.length === 6
        ? 1
        : parseInt(hex.slice(offset, offset + 2), 16) / 255,
    );
  };
  const canvas = color('background');
  const luminance = (rgba: number[]) =>
    rgba.slice(0, 3).reduce((total, channel, i) => {
      const opaque = channel * rgba[3]! + canvas[i]! * (1 - rgba[3]!);
      const linear =
        opaque <= 0.04045 ? opaque / 12.92 : ((opaque + 0.055) / 1.055) ** 2.4;
      return total + linear * [0.2126, 0.7152, 0.0722][i]!;
    }, 0);
  const [low, high] = [
    luminance(color(foreground)),
    luminance(color(background)),
  ].sort((a, b) => a - b);
  return (high! + 0.05) / (low! + 0.05);
}

for (const dark of [false, true]) {
  test(`${dark ? 'dark' : 'light'} text, warnings, status surfaces, control boundaries and focus meet contrast requirements`, () => {
    browserTheme(dark);
    for (const background of [
      'background',
      'drop',
      'panel',
      'selected',
      'control',
      'message',
      'progress',
    ]) {
      expect(
        themeContrast('text', background),
        `text on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        themeContrast('focus', background),
        `focus on ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const background of ['background', 'drop', 'panel', 'surround'])
      expect(
        themeContrast('muted', background),
        `muted on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    expect(themeContrast('subtle', 'background')).toBeGreaterThanOrEqual(4.5);
    expect(themeContrast('warning', 'panel')).toBeGreaterThanOrEqual(4.5);
    expect(themeContrast('on-accent', 'accent')).toBeGreaterThanOrEqual(4.5);
    for (const background of [
      'background',
      'drop',
      'panel',
      'control',
      'surround',
      'progress',
    ])
      expect(
        themeContrast('control-border', background),
        `boundary on ${background}`,
      ).toBeGreaterThanOrEqual(3);
    expect(themeContrast('accent', 'selected')).toBeGreaterThanOrEqual(3);
    expect(themeContrast('accent', 'surround')).toBeGreaterThanOrEqual(3);
    expect(themeContrast('accent', 'progress')).toBeGreaterThanOrEqual(3);
  });
}

function delayedNaming() {
  namingEnabled = true;
  let resolve!: (response: Response) => void;
  namingResponse = () =>
    new Promise<Response>((r) => {
      resolve = r;
    });
  return (status: NamingStatus) => resolve(Response.json(status));
}
function editName(a: ShinApp, value: string) {
  const input = a.shadowRoot!.querySelector('.name input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
test('disabled naming never polls and enabled naming is disclosed before upload', async () => {
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([path]) => String(path).endsWith('/naming')),
  ).toBe(false);
  a.remove();
  namingEnabled = true;
  const b = await app();
  await b.updateComplete;
  expect(b.shadowRoot!.textContent).toContain(
    'automatically sent to the configured AI service',
  );
});
test('pending naming permits navigation and download, success defaults name and preserves it through settings and both ZIP layouts', async () => {
  const finish = delayedNaming();
  const anchor = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  try {
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    expect(a.naming.state).toBe('pending');
    await page.getByRole('button', { name: 'Next: Download' }).click();
    await page.getByRole('button', { name: 'Download ZIP' }).click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('name=view&organizeIntoDeviceFolders=false'),
    );
    finish({ state: 'succeeded', name: 'moonlit-forest-view' });
    await vi.waitFor(() => expect(a.name).toBe('moonlit-forest-view'));
    await a.updateComplete;
    await expect
      .element(page.getByRole('img', { name: 'AI Powered', exact: true }))
      .toBeVisible();
    await vi.waitFor(() =>
      expect(
        a
          .shadowRoot!.querySelector('wa-icon')!
          .shadowRoot!.querySelector('svg'),
      ).not.toBeNull(),
    );
    expect(a.shadowRoot!.textContent).toContain(
      'moonlit-forest-view-phone.png',
    );
    await page
      .getByRole('checkbox', { name: 'Organize into device folders' })
      .click();
    await page.getByRole('button', { name: 'Download ZIP' }).click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'name=moonlit-forest-view&organizeIntoDeviceFolders=true',
      ),
    );
    await page.getByRole('button', { name: 'Back to Processing' }).click();
    checked(a, 'True black shadows');
    await vi.waitFor(() => expect(a.dirty).toBe(false));
    expect(a.name).toBe('moonlit-forest-view');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([path]) => String(path).endsWith('/naming')),
    ).toHaveLength(1);
  } finally {
    anchor.mockRestore();
  }
});
test.each(['edited-view', '', 'view'])(
  'late suggestion preserves any user edit including %j',
  async (value) => {
    const finish = delayedNaming();
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    await page.getByRole('button', { name: 'Next: Download' }).click();
    editName(a, 'temporary');
    editName(a, value);
    finish({ state: 'succeeded', name: 'moonlit-forest-view' });
    await vi.waitFor(() => expect(a.naming.state).toBe('succeeded'));
    expect(a.name).toBe(value);
    await a.updateComplete;
    expect(
      a.shadowRoot!.querySelector('wa-icon[label="AI Powered"]'),
    ).toBeNull();
  },
);
test('failure provides explicit Retry, retains cleared name and does not block downloads', async () => {
  const finish = delayedNaming();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  finish({
    state: 'failed',
    message: 'AI service unavailable. Retry or keep your name.',
  });
  await vi.waitFor(() => expect(a.naming.state).toBe('failed'));
  await page.getByRole('button', { name: 'Next: Download' }).click();
  editName(a, '');
  let complete!: (response: Response) => void;
  namingResponse = () =>
    new Promise<Response>((resolve) => {
      complete = resolve;
    });
  await page.getByRole('button', { name: 'Retry AI naming' }).click();
  await vi.waitFor(() => expect(a.naming.state).toBe('pending'));
  await expect
    .element(page.getByRole('button', { name: 'Download ZIP' }))
    .toBeEnabled();
  complete(Response.json({ state: 'succeeded', name: 'new-ai-name' }));
  await vi.waitFor(() => expect(a.naming.state).toBe('succeeded'));
  expect(a.name).toBe('');
  const posts = vi
    .mocked(fetch)
    .mock.calls.filter(
      ([path, init]) =>
        String(path).endsWith('/naming') && init?.method === 'POST',
    );
  expect(posts).toHaveLength(1);
});
test('Start over and a new image ignore old AI results even if job ids match; disconnect discards results', async () => {
  const oldFinish = delayedNaming();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await vi.waitFor(() => expect(a.page).toBe('input'));
  await a.updateComplete;
  const newFinish = delayedNaming();
  picker(a, [file('new.png')]);
  await processed(a);
  oldFinish({ state: 'succeeded', name: 'stale-name' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(a.name).toBe('new');
  expect(a.naming.state).toBe('pending');
  a.remove();
  newFinish({ state: 'succeeded', name: 'also-stale-name' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(a.name).toBe('new');
  const b = await app();
  expect(b.naming.state).toBe('disabled');
  expect(b.page).toBe('input');
});
test('clipboard default is replaced by a suggestion; rejected uploads never request naming', async () => {
  const finish = delayedNaming();
  const a = await app();
  failUpload = true;
  picker(a, [file()]);
  await vi.waitFor(() => expect(a.busy).toBe(''));
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([path]) => String(path).endsWith('/naming')),
  ).toBe(false);
  failUpload = false;
  const transfer = new DataTransfer();
  transfer.items.add(file('image.png'));
  document.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: transfer, cancelable: true }),
  );
  await processed(a);
  expect(a.name).toBe('wallpaper');
  finish({ state: 'succeeded', name: 'quiet-mountain-lake' });
  await vi.waitFor(() => expect(a.name).toBe('quiet-mountain-lake'));
  await a.updateComplete;
  expect(a.shadowRoot!.textContent).not.toContain('AI suggested');
  expect(a.shadowRoot!.querySelector('.message[role=status]')).toBeNull();
  await page.getByRole('button', { name: 'Next: Download' }).click();
  await a.updateComplete;
  await expect
    .element(page.getByRole('img', { name: 'AI Powered', exact: true }))
    .toBeVisible();
});

const aiCrops = {
  phone: { ...smart.phone, left: 30 },
  tablet: { ...smart.tablet, left: 40 },
  laptop: { ...smart.laptop, left: 50 },
};
function delayedDetection() {
  namingEnabled = true;
  let resolve!: (response: Response) => void;
  detectionResponse = () =>
    new Promise<Response>((r) => {
      resolve = r;
    });
  return () => resolve(Response.json({ state: 'succeeded', crops: aiCrops }));
}
function moveCrop(a: ShinApp, index: number, left: number) {
  const editor = a.shadowRoot!.querySelectorAll('crop-editor')[index]!;
  editor.dispatchEvent(
    new CustomEvent('crop-change', {
      detail: { ...(index === 0 ? a.crops.phone : a.crops.tablet), left },
      bubbles: true,
      composed: true,
    }),
  );
  editor.dispatchEvent(
    new CustomEvent('crop-commit', { bubbles: true, composed: true }),
  );
}
test('AI default has entropy previews; late success preserves a manual edit even returned to original, and exports current crops', async () => {
  const finish = delayedDetection();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  expect(a.prefs.method).toBe('ai');
  expect(a.crops).toEqual({ phone: smart.phone, tablet: smart.tablet });
  expect(a.shadowRoot!.textContent).toContain('Using entropy crops for now');
  moveCrop(a, 0, 100);
  await a.updateComplete;
  moveCrop(a, 0, smart.phone.left);
  finish();
  await vi.waitFor(() => expect(a.detection.state).toBe('succeeded'));
  expect(a.crops.phone).toEqual(smart.phone);
  expect(a.crops.tablet).toEqual(aiCrops.tablet);
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  expect(renderBodies.at(-1)!.crops).toEqual(a.crops);
  expect(a.shadowRoot!.querySelector('.message[role=status]')).toBeNull();
  await page.getByRole('button', { name: 'Next:' }).click();
  expect(a.page).toBe('download');
  expect(a.shadowRoot!.querySelector('.message[role=status]')).toBeNull();
  expect(renderBodies.at(-1)!.crops).toEqual(a.crops);
  await page.getByRole('button', { name: 'Back to Processing' }).click();
  const reset = [
    ...a.shadowRoot!.querySelectorAll<HTMLElement>('wa-button'),
  ].find((b) => b.textContent?.trim() === 'Reset position')!;
  reset.click();
  expect(a.crops.phone).toEqual(aiCrops.phone);
  checked(a, 'Laptop');
  expect(a.crops.laptop).toEqual(aiCrops.laptop);
});
test.each(['entropy', 'anchor'])(
  'late detection while %s is active leaves positions unchanged; switching back uses available AI result',
  async (method) => {
    const finish = delayedDetection();
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    await page
      .getByRole('radio', {
        name: method === 'entropy' ? 'Smart (entropy)' : 'top left',
        exact: true,
      })
      .click();
    const previous = structuredClone(a.crops);
    finish();
    await vi.waitFor(() => expect(a.detection.state).toBe('succeeded'));
    expect(a.crops).toEqual(previous);
    await page.getByRole('radio', { name: 'Smart (AI)', exact: true }).click();
    expect(a.crops).toEqual({ phone: aiCrops.phone, tablet: aiCrops.tablet });
  },
);
test('reset while pending makes crop eligible; failure retry preserves other manual edits and does not restart naming', async () => {
  let finish = delayedDetection();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  moveCrop(a, 0, 100);
  await a.updateComplete;
  const reset = [
    ...a.shadowRoot!.querySelectorAll<HTMLElement>('wa-button'),
  ].find((b) => b.textContent?.trim() === 'Reset position')!;
  reset.click();
  moveCrop(a, 1, 300);
  finish();
  await vi.waitFor(() => expect(a.detection.state).toBe('succeeded'));
  expect(a.crops.phone).toEqual(aiCrops.phone);
  expect(a.crops.tablet!.left).toBe(300);
  // Exercise a service failure and explicit retry on a fresh upload.
  await vi.waitFor(() => expect(a.busy).toBe(''));
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  detectionResponse = async () =>
    Response.json({ state: 'failed', message: 'Using entropy crops.' });
  picker(a, [file()]);
  await processed(a);
  await vi.waitFor(() => expect(a.detection.state).toBe('failed'));
  expect(a.prefs.method).toBe('ai');
  moveCrop(a, 1, 300);
  finish = delayedDetection();
  const namingPosts = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/naming') && init?.method === 'POST',
      ).length;
  const before = namingPosts();
  await page.getByRole('button', { name: 'Retry subject detection' }).click();
  await vi.waitFor(() => expect(a.detection.state).toBe('pending'));
  finish();
  await vi.waitFor(() => expect(a.detection.state).toBe('succeeded'));
  expect(a.crops.phone).toEqual(aiCrops.phone);
  expect(a.crops.tablet!.left).toBe(300);
  expect(namingPosts()).toBe(before);
});
test('no clear subject is explained and uses entropy; stale detection after start over cannot change new work', async () => {
  const finish = delayedDetection();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  await page.getByRole('button', { name: 'Next:' }).click();
  expect(a.detection.state).toBe('pending');
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  detectionResponse = async () => Response.json({ state: 'no-subject' });
  picker(a, [file()]);
  await processed(a);
  await vi.waitFor(() => expect(a.detection.state).toBe('no-subject'));
  finish();
  await a.updateComplete;
  expect(a.crops).toEqual({ phone: smart.phone, tablet: smart.tablet });
  expect(a.shadowRoot!.querySelector('[role=note]')!.textContent).toContain(
    'No clear subject',
  );
  expect(a.shadowRoot!.querySelector('.message[role=status]')).toBeNull();
});
test.each(['ai', 'entropy', 'smart', 'anchor'])(
  'enabled preference %s resolves and survives navigation, new images and reload',
  async (method) => {
    namingEnabled = true;
    preferences.method = method;
    let a = await app();
    const expected = method === 'smart' ? 'ai' : method;
    picker(a, [file()]);
    await processed(a);
    expect(a.prefs.method).toBe(expected);
    // Explicitly selecting the preference persists the resolved method.
    await page
      .getByRole('radio', {
        name:
          expected === 'anchor'
            ? 'center'
            : `Smart (${expected === 'ai' ? 'AI' : 'entropy'})`,
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Next:' }).click();
    await page.getByRole('button', { name: 'Back to Processing' }).click();
    expect(a.prefs.method).toBe(expected);
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    picker(a, [file()]);
    await processed(a);
    expect(a.prefs.method).toBe(expected);
    a.remove();
    a = await app();
    expect(a.prefs.method).toBe(expected);
  },
);
test('saved AI falls back to entropy when disabled and never polls detection', async () => {
  preferences.method = 'ai';
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  expect(a.prefs.method).toBe('entropy');
  expect(a.shadowRoot!.querySelector('[aria-label="Smart (AI)"]')).toBeNull();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).endsWith('/detection')),
  ).toBe(false);
});
for (const theme of ['light', 'dark'])
  for (const width of [280, 390, 1280]) {
    test(`AI controls have nonoverlapping touch targets and keyboard focus at ${width}px in ${theme}`, async () => {
      namingEnabled = true;
      await page.viewport(width, 900);
      document.documentElement.classList.add(`wa-${theme}`);
      try {
        const a = await app();
        picker(a, [file()]);
        await processed(a);
        const labels = [
          ...a.shadowRoot!.querySelectorAll<HTMLElement>('.crop-choice'),
        ];
        expect(labels).toHaveLength(7);
        for (const label of labels) {
          const rect = label.getBoundingClientRect();
          expect(rect.width).toBeGreaterThanOrEqual(44);
          expect(rect.height).toBeGreaterThanOrEqual(44);
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(width);
          for (const other of labels.filter((l) => l !== label)) {
            const b = other.getBoundingClientRect();
            expect(
              rect.right <= b.left ||
                rect.left >= b.right ||
                rect.bottom <= b.top ||
                rect.top >= b.bottom,
            ).toBe(true);
          }
        }
        expect(document.documentElement.scrollWidth).toBe(width);
        const radio = a.shadowRoot!.querySelector<HTMLInputElement>(
          '[aria-label="Smart (AI)"]',
        )!;
        radio.focus();
        await userEvent.keyboard('{ArrowRight}');
        await a.updateComplete;
        await expect
          .element(
            page.getByRole('radio', { name: 'Smart (entropy)', exact: true }),
          )
          .toBeChecked();
        expect(
          getComputedStyle(a.shadowRoot!.activeElement!.closest('label')!)
            .outlineStyle,
        ).toBe('solid');
        expect(
          getComputedStyle(
            a.shadowRoot!.activeElement!.closest('label')!,
            '::after',
          ).content,
        ).toBe('"✓"');
      } finally {
        await page.viewport(1280, 900);
      }
    });
  }

test('late AI result on Download invalidates previous previews and exports until matching render completes', async () => {
  const finish = delayedDetection();
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  await page.getByRole('button', { name: 'Next:' }).click();
  const original = globalThis.fetch;
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      if (input.endsWith('/render')) {
        renderBodies.push(JSON.parse(init!.body as string));
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return original(input, init);
    }),
  );
  finish();
  await vi.waitFor(() => expect(a.detection.state).toBe('succeeded'));
  expect(a.dirty).toBe(true);
  await a.updateComplete;
  await expect
    .element(page.getByRole('button', { name: 'Download ZIP' }))
    .toBeDisabled();
  expect(a.shadowRoot!.querySelectorAll('img.output')).toHaveLength(0);
  await vi.waitFor(() => expect(release).toBeDefined());
  expect(renderBodies.at(-1)!.crops).toEqual({
    phone: aiCrops.phone,
    tablet: aiCrops.tablet,
  });
  release(
    Response.json({
      revision: 'ai-final',
      source: pixel,
      outputs: { phone: pixel, tablet: pixel },
    }),
  );
  await vi.waitFor(() => expect(a.dirty).toBe(false));
  await expect
    .element(page.getByRole('button', { name: 'Download ZIP' }))
    .toBeEnabled();
  expect(a.manifest!.revision).toBe('ai-final');
});

async function downloadScreen(enabled = true) {
  serverSavingEnabled = enabled;
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  await page.getByRole('button', { name: 'Next: Download' }).click();
  return a;
}

test('server saving is unavailable when unconfigured and no path input is offered', async () => {
  const a = await downloadScreen(false);
  expect(a.shadowRoot!.textContent).not.toContain('Save to server');
  expect(a.shadowRoot!.querySelectorAll('input[type=text]')).toHaveLength(1);
  expect(saveBodies).toHaveLength(0);
});

for (const width of [320, 1440]) {
  for (const appearance of ['light', 'dark']) {
    test(`save feedback, replacement and cancel remain accessible at ${width}px in ${appearance}`, async () => {
      await page.viewport(width, 900);
      document.documentElement.classList.add(`wa-${appearance}`);
      const a = await downloadScreen();
      expect(saveBodies).toHaveLength(0);
      await page.getByRole('textbox', { name: 'Wallpaper name' }).fill('...');
      saveResponse = async () =>
        Response.json({
          state: 'conflicts',
          destination: '/data/output',
          saved: [],
          conflicts: ['wallpaper-phone.png'],
          failed: [],
          confirmation: 'review',
        });
      await page
        .getByRole('button', { name: 'Save to server', exact: true })
        .click();
      await vi.waitFor(() => expect(a.serverSave?.state).toBe('conflicts'));
      expect(saveBodies[0]).toEqual({
        name: 'wallpaper',
        organizeIntoDeviceFolders: false,
      });
      expect(
        a
          .shadowRoot!.querySelector('.save-feedback')!
          .getAttribute('aria-live'),
      ).toBe('polite');
      expect(a.shadowRoot!.textContent).toContain('wallpaper-phone.png');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(saveBodies).toHaveLength(1);
      await page
        .getByRole('button', { name: 'Save to server', exact: true })
        .click();
      await vi.waitFor(() => expect(a.serverSave?.state).toBe('conflicts'));
      saveResponse = async () =>
        Response.json({
          state: 'saved',
          destination: '/data/output',
          saved: ['wallpaper-phone.png', 'wallpaper-tablet.png'],
          failed: [],
          conflicts: [],
        });
      // Keyboard activation on the explicit replacement control.
      const replace = a.shadowRoot!.querySelector(
        '.save-feedback wa-button',
      ) as HTMLElement;
      replace.focus();
      await userEvent.keyboard('{Enter}');
      await vi.waitFor(() => expect(a.serverSave?.state).toBe('saved'));
      expect(saveBodies[2]!.confirmation).toBe('review');
      expect(a.shadowRoot!.textContent).toContain('Saved to');
      expect(a.shadowRoot!.textContent).toContain('/data/output');
      expect(document.documentElement.scrollWidth).toBe(width);
      for (const control of a.shadowRoot!.querySelectorAll('wa-button')) {
        const rect = control.getBoundingClientRect();
        expect(rect.right).toBeLessThanOrEqual(width);
        expect(rect.left).toBeGreaterThanOrEqual(0);
      }
    });
  }
}

test('save snapshots layout/name, prevents duplicate submissions, and reports partial failure', async () => {
  const a = await downloadScreen();
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .click();
  let finish!: (response: Response) => void;
  saveResponse = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await vi.waitFor(() => expect(saveBodies).toHaveLength(1));
  expect(saveBodies[0]!.organizeIntoDeviceFolders).toBe(true);
  expect(a.busy).toContain('Saving');
  const button = page.getByRole('button', {
    name: 'Save to server',
    exact: true,
  });
  await expect.element(button).toBeDisabled();
  expect(
    (a.shadowRoot!.querySelector('input[type=text]') as HTMLInputElement)
      .disabled,
  ).toBe(true);
  finish(
    Response.json({
      state: 'failed',
      destination: '/data/output',
      saved: ['phone/view.png'],
      conflicts: [],
      failed: [
        {
          path: 'tablet/view.png',
          message: 'Destination storage is full. Free space and retry.',
        },
      ],
    }),
  );
  await vi.waitFor(() => expect(a.serverSave?.state).toBe('failed'));
  expect(a.shadowRoot!.textContent).toContain('Save incomplete.');
  expect(a.shadowRoot!.textContent).toContain('phone/view.png');
  expect(
    a.shadowRoot!.querySelector('.save-feedback [role=alert]')!.textContent,
  ).toContain('tablet/view.png');
  expect(a.shadowRoot!.textContent).toContain('Free space and retry');
  await expect.element(button).not.toBeDisabled();
  await page.getByRole('button', { name: 'Back to Processing' }).click();
  await page.getByRole('button', { name: 'Start over' }).click();
  await vi.waitFor(() => expect(a.page).toBe('input'));
});

test('name, layout and rendering changes discard overwrite approval; stale outputs cannot save', async () => {
  const a = await downloadScreen();
  saveResponse = async () =>
    Response.json({
      state: 'conflicts',
      destination: '/data/output',
      saved: [],
      conflicts: ['view-phone.png'],
      failed: [],
      confirmation: 'review',
    });
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await vi.waitFor(() => expect(a.serverSave?.state).toBe('conflicts'));
  await page.getByRole('textbox', { name: 'Wallpaper name' }).fill('new');
  expect(a.serverSave).toBeUndefined();
  await page
    .getByRole('button', { name: 'Save to server', exact: true })
    .click();
  await vi.waitFor(() => expect(a.serverSave?.state).toBe('conflicts'));
  expect(saveBodies[1]).not.toHaveProperty('confirmation');
  await page
    .getByRole('checkbox', { name: 'Organize into device folders' })
    .click();
  expect(a.serverSave).toBeUndefined();
  a.dirty = true;
  await a.updateComplete;
  await expect
    .element(page.getByRole('button', { name: 'Save to server', exact: true }))
    .toBeDisabled();
});

const pendingOled: OledAnalysis = {
  state: 'pending',
  candidate: true,
  darkPercentage: 60,
  oled: true,
  threshold: 16,
  evaluated: [],
};
test('per-image local defaults replace saved OLED preferences and remain usable while AI is pending', async () => {
  oledInitial = { ...pendingOled };
  oledResponse = async () => Response.json(pendingOled);
  preferences.oled = false;
  preferences.threshold = 200;
  const a = await app();
  picker(a, [file()]);
  await processed(a);
  expect(a.prefs.oled).toBe(true);
  expect(a.prefs.threshold).toBe(16);
  expect(a.shadowRoot!.textContent).toContain('AI is comparing cutoffs');
  expect(a.shadowRoot!.textContent).toContain(
    'Local fallback: on at cutoff 16.',
  );
  expect(a.shadowRoot!.textContent).not.toContain(
    'Recommended on at cutoff 16.',
  );
  await page.getByRole('button', { name: 'Next: Download' }).click();
  expect(a.page).toBe('download');
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await vi.waitFor(() => expect(a.page).toBe('input'));
  oledInitial = {
    ...pendingOled,
    state: 'skipped',
    candidate: false,
    oled: false,
    darkPercentage: 0,
  };
  await a.updateComplete;
  picker(a, [file('bright.png')]);
  await processed(a);
  expect(a.prefs.oled).toBe(false);
  expect(a.prefs.threshold).toBe(16);
});
test.each([true, false])(
  'automatic OLED completion updates current previews, including off=%s',
  async (off) => {
    oledInitial = { ...pendingOled };
    let finish: ((r: Response) => void) | undefined;
    oledResponse = () =>
      new Promise<Response>((r) => {
        finish = r;
      });
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    const first = a.manifest;
    finish!(
      Response.json({
        ...pendingOled,
        state: 'succeeded',
        oled: !off,
        threshold: off ? 16 : 42,
      }),
    );
    await vi.waitFor(() => expect(a.oledAnalysis?.state).toBe('succeeded'));
    await vi.waitFor(() => expect(a.manifest).not.toBe(first));
    await vi.waitFor(() => expect(a.dirty).toBe(false));
    expect(a.shadowRoot!.textContent).toContain('AI recommendation:');
    expect(a.shadowRoot!.textContent).not.toContain('Local fallback:');
    expect(renderBodies.at(-1)).toMatchObject({
      oled: !off,
      threshold: off ? 16 : 42,
    });
  },
);
test.each(['threshold', 'switch'])(
  'manual %s edit then restore protects both OLED settings from completion and Retry; new image resets protection',
  async (control) => {
    oledInitial = { ...pendingOled };
    let finish: ((r: Response) => void) | undefined;
    oledResponse = () =>
      new Promise<Response>((r) => {
        finish = r;
      });
    const a = await app();
    picker(a, [file()]);
    await processed(a);
    if (control === 'threshold') {
      threshold(a, 50);
      threshold(a, 16);
    } else {
      checked(a, 'True black shadows');
      await a.updateComplete;
      checked(a, 'True black shadows');
    }
    finish!(
      Response.json({
        ...pendingOled,
        state: 'failed',
        message: 'Controlled failure',
      }),
    );
    await vi.waitFor(() => expect(a.oledAnalysis?.state).toBe('failed'));
    await page.getByRole('button', { name: 'Retry OLEDify analysis' }).click();
    await vi.waitFor(() => expect(a.busy).toBe(''));
    finish!(Response.json({ ...pendingOled, state: 'succeeded', oled: false }));
    await vi.waitFor(() => expect(a.oledAnalysis?.state).toBe('succeeded'));
    expect(a.prefs.oled).toBe(true);
    expect(a.prefs.threshold).toBe(16);
    expect(a.shadowRoot!.textContent).toContain(
      'manual settings are protected',
    );
    await vi.waitFor(() => expect(a.busy).toBe(''));
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    await vi.waitFor(() => expect(a.page).toBe('input'));
    await a.updateComplete;
    oledInitial = { ...pendingOled, state: 'succeeded', oled: false };
    picker(a, [file('replacement.png')]);
    await processed(a);
    expect(a.prefs.oled).toBe(false);
  },
);
