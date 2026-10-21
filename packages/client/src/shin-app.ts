import { LitElement, css, html, nothing } from 'lit';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import './crop-editor.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import aiSparkles from './assets/ai-sparkles.svg';
import exampleWallpaper from './assets/dusk-ridges.svg';
import type {
  Anchor,
  Crop,
  Device,
  Job,
  Manifest,
  Preferences,
  NamingStatus,
  DetectionStatus,
  SaveResult,
} from '../../server/src/protocol.js';

type Catalog = {
  aiEnabled?: boolean;
  serverSavingEnabled?: boolean;
  devices: Device[];
  preferences: Preferences;
  preferenceError: string;
};
export class ShinApp extends LitElement {
  static properties = {
    naming: { state: true },
    detection: { state: true },
    aiEnabled: { state: true },
    nameEdited: { state: true },
    page: { state: true },
    devices: { state: true },
    prefs: { state: true },
    job: { state: true },
    crops: { state: true },
    manifest: { state: true },
    name: { state: true },
    error: { state: true },
    preferenceError: { state: true },
    busy: { state: true },
    dirty: { state: true },
    ready: { state: true },
    oledProcessing: { state: true },
    serverSavingEnabled: { state: true },
    serverSave: { state: true },
  };
  page: 'input' | 'processing' | 'download' = 'input';
  devices: Device[] = [];
  prefs: Preferences = {
    devices: [],
    method: 'smart',
    anchor: 'center',
    oled: false,
    threshold: 16,
    organizeIntoDeviceFolders: false,
  };
  job: Job | undefined;
  crops: Record<string, Crop> = {};
  manifest: Manifest | undefined;
  detection: DetectionStatus = { state: 'disabled' };
  private detectionController?: AbortController;
  private manuallyPositioned = new Set<string>();
  naming: NamingStatus = { state: 'disabled' };
  aiEnabled = false;
  serverSavingEnabled = false;
  serverSave: SaveResult | undefined;
  private saveSelection = '';
  nameEdited = false;
  private namingController?: AbortController;
  name = '';
  error = '';
  preferenceError = '';
  busy = '';
  dirty = false;
  ready = false;
  oledProcessing = false;
  private generation = 0;
  private rendering = false;
  private timer?: ReturnType<typeof setTimeout>;
  private prefVersion = 0;
  private prefSaving = Promise.resolve();
  private paste = (e: ClipboardEvent) => {
    if (this.page !== 'input' || !e.clipboardData?.files.length) return;
    e.preventDefault();
    void this.upload([...e.clipboardData.files], true);
  };
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('paste', this.paste);
    void this.load();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('paste', this.paste);
    clearTimeout(this.timer);
    this.namingController?.abort();
    this.detectionController?.abort();
  }
  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(path, init);
    if (!r.ok) {
      let message = `Request failed (${r.status}). Please retry.`;
      try {
        message = ((await r.json()) as { message: string }).message;
      } catch {
        /* retain status */
      }
      throw new Error(message);
    }
    return (await r.json()) as T;
  }
  private async load() {
    try {
      const catalog = await this.api<Catalog>('/api/catalog');
      this.aiEnabled = catalog.aiEnabled ?? false;
      this.serverSavingEnabled = catalog.serverSavingEnabled ?? false;
      this.devices = catalog.devices;
      this.prefs = {
        ...catalog.preferences,
        method:
          catalog.preferences.method === 'smart'
            ? this.aiEnabled
              ? 'ai'
              : 'entropy'
            : catalog.preferences.method === 'ai' && !this.aiEnabled
              ? 'entropy'
              : catalog.preferences.method,
      };
      this.preferenceError = catalog.preferenceError;
      this.ready = true;
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  private save() {
    const next = structuredClone(this.prefs);
    const version = ++this.prefVersion;
    this.prefSaving = this.prefSaving
      .catch(() => {})
      .then(async () => {
        try {
          await this.api('/api/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          if (version === this.prefVersion) this.preferenceError = '';
        } catch (e) {
          if (version === this.prefVersion)
            this.preferenceError = (e as Error).message;
        }
      });
  }
  private async upload(files: File[], clipboard = false) {
    if (this.busy || !this.ready) return;
    this.error = '';
    if (files.length !== 1) {
      this.error = 'Choose one image at a time.';
      return;
    }
    const file = files[0]!;
    if (
      file.type &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      this.error = 'Choose a JPEG, PNG, or WebP image.';
      return;
    }
    this.busy = 'Uploading and finding Smart crops…';
    try {
      this.job = await this.api<Job>('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      this.name =
        file.name && !(clipboard && file.name === 'image.png')
          ? file.name.replace(/\.[^.]+$/, '')
          : 'wallpaper';
      this.nameEdited = false;
      this.detection = this.job.detection ?? { state: 'disabled' };
      void this.watchDetection(this.job.id);
      this.naming = this.job.naming ?? { state: 'disabled' };
      void this.watchNaming(this.job.id);
      this.page = 'processing';
      this.resetAll();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = '';
      if (this.job) this.schedule();
    }
  }
  private async watchNaming(id: string, retry = false) {
    this.namingController?.abort();
    const controller = new AbortController();
    this.namingController = controller;
    const current = () => !controller.signal.aborted && this.job?.id === id;
    try {
      if (retry) {
        this.naming = { state: 'pending' };
        const status = await this.api<NamingStatus>(`/api/jobs/${id}/naming`, {
          method: 'POST',
          signal: controller.signal,
        });
        if (!current()) return;
        this.naming = status;
      }
      while (current() && this.naming.state === 'pending') {
        const status = await this.api<NamingStatus>(`/api/jobs/${id}/naming`, {
          signal: controller.signal,
        });
        if (!current()) return;
        this.naming = status;
        if (status.state === 'pending')
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 750);
            controller.signal.addEventListener('abort', done, { once: true });
          });
      }
      if (current() && this.naming.state === 'succeeded' && !this.nameEdited)
        this.name = this.naming.name;
    } catch {
      if (current())
        this.naming = {
          state: 'failed',
          message: 'AI naming is unavailable. Keep your current name or retry.',
        };
    }
  }
  private async watchDetection(id: string, retry = false) {
    this.detectionController?.abort();
    const controller = new AbortController();
    this.detectionController = controller;
    const current = () => !controller.signal.aborted && this.job?.id === id;
    const accept = (status: DetectionStatus) => {
      this.detection = status;
      if (status.state === 'succeeded' && this.prefs.method === 'ai') {
        let changed = false;
        const crops = { ...this.crops };
        for (const d of this.selected) {
          if (!this.manuallyPositioned.has(d.id)) {
            crops[d.id] = { ...status.crops[d.id]! };
            changed = true;
          }
        }
        if (changed) {
          this.crops = crops;
          this.schedule();
        }
      }
    };
    try {
      if (retry) {
        this.detection = { state: 'pending' };
        const status = await this.api<DetectionStatus>(
          `/api/jobs/${id}/detection`,
          { method: 'POST', signal: controller.signal },
        );
        if (!current()) return;
        accept(status);
      }
      while (current() && this.detection.state === 'pending') {
        const status = await this.api<DetectionStatus>(
          `/api/jobs/${id}/detection`,
          { signal: controller.signal },
        );
        if (!current()) return;
        accept(status);
        if (status.state === 'pending')
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 750);
            controller.signal.addEventListener('abort', done, { once: true });
          });
      }
    } catch {
      if (current())
        this.detection = {
          state: 'failed',
          message:
            'AI subject detection is unavailable. Using entropy crops. You can continue or retry.',
        };
    }
  }
  private position(d: Device): Crop {
    const j = this.job!;
    if (this.prefs.method === 'ai' && this.detection.state === 'succeeded')
      return { ...this.detection.crops[d.id]! };
    if (this.prefs.method !== 'anchor') return { ...j.smart[d.id]! };
    const c = j.smart[d.id]!;
    return {
      ...c,
      left: Math.round(
        (j.width - c.width) *
          (this.prefs.anchor.includes('left')
            ? 0
            : this.prefs.anchor.includes('right')
              ? 1
              : 0.5),
      ),
      top: Math.round(
        (j.height - c.height) *
          (this.prefs.anchor.includes('top')
            ? 0
            : this.prefs.anchor.includes('bottom')
              ? 1
              : 0.5),
      ),
    };
  }
  private resetAll() {
    this.manuallyPositioned.clear();
    this.crops = Object.fromEntries(
      this.selected.map((d) => [d.id, this.position(d)]),
    );
    this.schedule();
  }
  private get selected() {
    return this.devices.filter((d) => this.prefs.devices.includes(d.id));
  }
  private schedule() {
    this.serverSave = undefined;
    this.dirty = true;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.renderPreviews();
    }, 180);
  }
  private async renderPreviews() {
    if (this.rendering || !this.job || this.page === 'input') return;
    clearTimeout(this.timer);
    this.rendering = true;
    this.busy = 'Generating previews and PNG downloads…';
    const version = this.generation;
    const id = this.job.id;
    try {
      const manifest = await this.api<Manifest>(`/api/jobs/${id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crops: this.crops,
          oled: this.prefs.oled,
          threshold: this.prefs.threshold,
        }),
      });
      if (version === this.generation && this.job?.id === id) {
        this.manifest = manifest;
        this.dirty = false;
        this.error = '';
      }
    } catch (e) {
      if (version === this.generation) this.error = (e as Error).message;
    } finally {
      this.rendering = false;
      this.busy = '';
      if (version === this.generation && this.job?.id === id)
        this.oledProcessing = false;
      if (version !== this.generation && this.job?.id === id)
        void this.renderPreviews();
    }
  }
  private async startOver() {
    if (this.busy) return;
    try {
      if (this.job)
        await this.api(`/api/jobs/${this.job.id}`, { method: 'DELETE' });
      this.namingController?.abort();
      this.detectionController?.abort();
      this.detection = { state: 'disabled' };
      this.naming = { state: 'disabled' };
      this.nameEdited = false;
      this.generation++;
      this.job = undefined;
      this.manifest = undefined;
      this.crops = {};
      this.name = '';
      this.serverSave = undefined;
      this.error = '';
      this.page = 'input';
      this.dirty = false;
      this.oledProcessing = false;
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  private async download(path: string, filename: string) {
    if (this.dirty || this.busy) return;
    this.busy = 'Preparing download…';
    this.error = '';
    try {
      const response = await fetch(path);
      if (!response.ok) {
        let message = 'Download failed. Please retry.';
        try {
          message = ((await response.json()) as { message: string }).message;
        } catch {
          /* retain fallback */
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = '';
    }
  }
  private safeName() {
    return (
      this.name
        .normalize('NFKC')
        .replace(/[/\\]/g, '-')
        .replace(/[^\p{L}\p{N} ._-]/gu, '-')
        .replace(/^[.\s-]+|[.\s-]+$/g, '')
        .slice(0, 100)
        .replace(/[.\s-]+$/g, '') || 'wallpaper'
    );
  }
  private currentSaveSelection() {
    return JSON.stringify([
      this.job?.id,
      this.manifest?.revision,
      this.safeName(),
      this.prefs.organizeIntoDeviceFolders,
    ]);
  }
  private async saveToServer(replace = false) {
    if (this.busy || this.dirty || !this.manifest || !this.job) return;
    const selection = this.currentSaveSelection();
    const confirmation =
      replace && this.saveSelection === selection
        ? this.serverSave?.confirmation
        : undefined;
    this.busy = 'Saving wallpapers to server…';
    this.serverSave = undefined;
    try {
      const result = await this.api<SaveResult>(
        `/api/jobs/${this.job.id}/save/${this.manifest.revision}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: this.safeName(),
            organizeIntoDeviceFolders: this.prefs.organizeIntoDeviceFolders,
            ...(confirmation ? { confirmation } : {}),
          }),
        },
      );
      this.saveSelection = selection;
      this.serverSave = result;
    } catch (error) {
      this.serverSave = {
        state: 'failed',
        destination: '',
        saved: [],
        conflicts: [],
        failed: [{ path: '', message: (error as Error).message }],
      };
    } finally {
      this.busy = '';
    }
  }
  static styles = css`
    :host {
      display: block;
      color: var(--app-text);
    }
    * {
      box-sizing: border-box;
    }
    header {
      padding: 1.4rem max(1.25rem, calc((100vw - 1280px) / 2));
      display: flex;
      align-items: center;
      gap: 2rem;
      border-bottom: 1px solid var(--app-header-border);
    }
    header strong {
      font-size: 1.3rem;
      letter-spacing: -0.045em;
      margin-right: auto;
    }
    nav {
      display: flex;
      gap: 1.25rem;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--app-muted);
      font-size: 0.875rem;
    }
    .step b {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 1px solid var(--app-control-border);
      border-radius: 50%;
      font-size: 0.8rem;
    }
    .step[aria-current] {
      color: var(--app-text);
      font-weight: 650;
    }
    .step[aria-current] b {
      color: var(--app-on-accent);
      background: var(--app-accent);
      border-color: var(--app-accent);
    }
    main {
      max-width: 1280px;
      padding: 2rem 2.5rem 3rem;
      margin: auto;
    }
    h1 {
      font:
        400 clamp(2.5rem, 4.5vw, 3.5rem)/1.12 Georgia,
        serif;
      letter-spacing: -0.035em;
      margin: 0.5rem 0 1rem;
    }
    h2 {
      font-size: 1.05rem;
      margin: 0 0 1rem;
    }
    h3 {
      font-size: 1rem;
      font-weight: 650;
      margin: 0 0 1rem;
      overflow-wrap: anywhere;
    }
    p {
      line-height: 1.5;
      color: var(--app-muted);
    }
    .intro {
      margin-bottom: 2rem;
    }
    .input-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: center;
    }
    .drop {
      border: 1px dashed var(--app-control-border);
      background: var(--app-drop);
      text-align: center;
      padding: 2.5rem 1.5rem;
    }
    .drop h2 {
      font-size: 1.15rem;
      margin-bottom: 1.25rem;
    }
    .drop:focus-within {
      outline: 3px solid var(--app-focus);
      outline-offset: 4px;
    }
    .drop input {
      display: block;
      max-width: 100%;
      width: 10rem;
      color: transparent;
      margin: auto;
    }
    input[type='file']::file-selector-button {
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      width: 100%;
      border: 1px solid var(--app-accent);
      border-radius: 4px;
      background: var(--app-accent);
      color: var(--app-on-accent);
      cursor: pointer;
    }
    input[type='file']:disabled::file-selector-button {
      color: var(--app-muted);
      background: var(--app-selected);
      border-color: var(--app-control-border);
      cursor: wait;
    }
    .disclosure {
      border-top: 1px solid var(--app-panel-border);
      padding-top: 1rem;
      margin-top: 1.5rem;
      text-align: left;
      font-size: 0.875rem;
    }
    .example {
      background: var(--app-panel);
      padding: 2rem;
      margin: 0;
    }
    .example-image {
      position: relative;
    }
    .example img {
      display: block;
      width: 100%;
    }
    .example-image::before,
    .example-image::after {
      content: '';
      position: absolute;
      border: 2px solid white;
      box-shadow: 0 0 0 1px black;
    }
    .example-image::before {
      top: 5%;
      bottom: 5%;
      left: 16%;
      width: 28%;
    }
    .example-image::after {
      top: 20%;
      bottom: 20%;
      left: 48%;
      width: 40%;
    }
    figcaption {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: var(--app-muted);
    }
    input,
    select {
      font: inherit;
      accent-color: var(--app-accent);
    }
    input[type='text'] {
      width: 100%;
      padding: 0.75rem;
      min-height: 48px;
      border: 1px solid var(--app-control-border);
      border-radius: 4px;
      background: var(--app-control);
      color: var(--app-text);
    }
    label {
      line-height: 1.5;
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 3px solid var(--app-focus);
      outline-offset: 3px;
    }
    .layout {
      display: grid;
      grid-template-columns: 310px minmax(0, 1fr);
      gap: 2rem;
    }
    .panel {
      container-type: inline-size;
      align-self: start;
      padding: 1.25rem;
      background: var(--app-panel);
      border-radius: 4px;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      min-width: 0;
    }
    fieldset + fieldset {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--app-panel-border);
    }
    legend {
      float: left;
      width: 100%;
      padding: 0;
      font-weight: 650;
      margin-bottom: 0.75rem;
    }
    legend + * {
      clear: both;
    }
    .options {
      display: grid;
    }
    .options label,
    fieldset > label,
    .folder-choice {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-height: 44px;
      font-size: 0.875rem;
    }
    input[type='checkbox'] {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .crop-method {
      display: grid;
      gap: 1rem;
    }
    .smart-choices {
      display: grid;
      gap: 0.5rem;
    }
    .crop-choice {
      position: relative;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--app-text);
    }
    .crop-choice input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }
    .crop-choice:has(:checked) {
      background: var(--app-selected);
      border-color: var(--app-accent);
      box-shadow: inset 0 0 0 1px var(--app-accent);
    }
    .crop-choice:has(:checked)::after {
      content: '✓';
      position: absolute;
      right: 7px;
      bottom: 6px;
      font-size: 0.875rem;
      font-weight: 700;
      line-height: 1;
      pointer-events: none;
    }
    .crop-choice:has(:focus-visible) {
      outline: 3px solid var(--app-focus);
      outline-offset: 3px;
      z-index: 1;
    }
    .crop-choice:hover {
      background: var(--app-selected);
    }
    .smart-choice {
      width: 100%;
      min-height: 48px;
      height: auto;
      padding: 0.75rem 2rem 0.75rem 0.75rem;
      display: flex;
      gap: 0.75rem;
      border-color: var(--app-control-border);
      background: var(--app-control);
      font-size: 0.875rem;
    }
    .smart-choice wa-icon {
      font-size: 1.25rem;
      color: var(--app-accent);
    }
    .smart-label small {
      font: inherit;
    }
    .anchors {
      display: grid;
      grid-template: repeat(3, 44px) / repeat(3, 44px);
      width: max-content;
      border: 1px solid var(--app-control-border);
      background: var(--app-control);
      border-radius: 4px;
    }
    .top-left {
      grid-area: 1 / 1;
    }
    .top-right {
      grid-area: 1 / 3;
    }
    .center {
      grid-area: 2 / 2;
    }
    .bottom-left {
      grid-area: 3 / 1;
    }
    .bottom-right {
      grid-area: 3 / 3;
    }
    .anchor-mark {
      width: 13px;
      height: 13px;
      border: 2px solid currentColor;
      pointer-events: none;
    }
    .top-left .anchor-mark {
      border-width: 2px 0 0 2px;
    }
    .top-right .anchor-mark {
      border-width: 2px 2px 0 0;
    }
    .bottom-left .anchor-mark {
      border-width: 0 0 2px 2px;
    }
    .bottom-right .anchor-mark {
      border-width: 0 2px 2px 0;
    }
    .center .anchor-mark {
      border-radius: 50%;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    input[type='range'] {
      width: 100%;
      height: 44px;
      margin: 0;
      appearance: none;
      background: transparent;
    }
    input[type='range']::-webkit-slider-runnable-track {
      height: 6px;
      border: 1px solid var(--app-control-border);
      background: var(--app-surround);
      border-radius: 4px;
    }
    input[type='range']::-moz-range-track {
      height: 6px;
      border: 1px solid var(--app-control-border);
      background: var(--app-surround);
      border-radius: 4px;
    }
    input[type='range']::-webkit-slider-thumb {
      appearance: none;
      width: 18px;
      height: 18px;
      margin-top: -7px;
      border: 0;
      border-radius: 50%;
      background: var(--app-accent);
    }
    input[type='range']::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: 0;
      border-radius: 50%;
      background: var(--app-accent);
    }
    input[type='range']:disabled {
      opacity: 0.5;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
      gap: 1.5rem;
    }
    .card {
      padding: 1.125rem;
      background: var(--app-panel);
      min-width: 0;
    }
    .source-wrap {
      background: var(--app-panel);
      padding: 1rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .source {
      max-width: 145px;
      width: 35%;
      max-height: 97px;
      object-fit: contain;
      display: block;
    }
    .source-wrap .meta {
      margin: 0;
    }
    .output {
      display: block;
      width: 100%;
      height: 300px;
      object-fit: contain;
      margin: 1.5rem auto;
    }
    .meta {
      font-size: 0.875rem;
      overflow-wrap: anywhere;
    }
    .warning {
      color: var(--app-warning);
    }
    .message {
      border: 1px solid var(--app-message-border);
      background: var(--app-message);
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      overflow-wrap: anywhere;
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--app-progress);
      margin-bottom: 1rem;
    }
    .delivery {
      background: var(--app-panel);
      padding: 1.5rem;
      display: flex;
      gap: 2rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }
    .name {
      display: block;
      width: min(100%, 32rem);
    }
    .name input {
      margin-top: 0.5rem;
    }
    .download-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }
    .save-feedback {
      overflow-wrap: anywhere;
    }
    .oled-toast {
      position: fixed;
      inset: auto 1rem max(1rem, env(safe-area-inset-bottom)) auto;
      z-index: 10;
      max-width: calc(100vw - 2rem);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      border: 1px solid var(--app-control-border);
      border-radius: 4px;
      background: var(--app-progress);
      box-shadow: 0 4px 18px var(--app-shadow);
      pointer-events: none;
    }
    wa-spinner {
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 1.5rem;
    }
    .images > .actions {
      justify-content: flex-end;
    }
    .ai-indicator {
      color: var(--app-accent);
      font-size: 1rem;
      vertical-align: -0.125em;
      margin-inline-start: 0.35rem;
    }
    wa-button {
      max-width: 100%;
      margin: 0.15rem 0;
    }
    wa-button::part(base) {
      min-height: 44px;
      border-radius: 4px;
      white-space: normal;
      height: auto;
    }
    wa-button::part(label) {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .stale .output {
      opacity: 0.55;
    }
    @media (max-width: 800px) {
      header {
        flex-wrap: wrap;
        gap: 1rem;
        padding: 1rem 1.25rem;
      }
      nav {
        order: 3;
        width: 100%;
        justify-content: space-between;
        gap: 0.25rem;
      }
      .step {
        gap: 0.3rem;
        font-size: 0.75rem;
      }
      .step b {
        width: 25px;
        height: 25px;
      }
      main {
        padding: 1.5rem 1.25rem 2rem;
      }
      .input-layout,
      .layout {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      .input-layout .example {
        padding: 1.5rem;
      }
      .drop {
        padding: 2rem 1.25rem;
      }
      .delivery {
        display: block;
        padding: 1.25rem;
      }
      .download-actions {
        margin-top: 1rem;
      }
      .name {
        width: 100%;
      }
      .images > .actions wa-button {
        width: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      wa-spinner {
        display: none;
      }
    }
  `;
  render() {
    const j = this.job;
    const usable = !!this.manifest && !this.dirty && !this.busy;
    return html` <header>
        <strong>shin-wallslice</strong>
        <nav aria-label="Workflow">
          ${(['input', 'processing', 'download'] as const).map((stage, index) => html`<span class="step" aria-current=${this.page === stage ? 'step' : nothing}><b aria-hidden="true">${index + 1}</b>${stage[0]!.toUpperCase() + stage.slice(1)}</span>`)}
        </nav>
        ${this.page !== 'input' ? html`<wa-button appearance="outlined" size="s" ?disabled=${!!this.busy} @click=${() => this.startOver()}>Start over</wa-button>` : nothing}
      </header>
      <main class=${this.page === 'input' ? 'input' : ''}>
        ${this.error ? html`<div class="message" role="alert">${this.error} <wa-button appearance="outlined" size="s" @click=${() => (this.job ? this.renderPreviews() : this.load())}>Retry</wa-button></div>` : nothing}
        ${this.preferenceError ? html`<div class="message" role="alert">${this.preferenceError}<wa-button appearance="outlined" size="s" @click=${() => this.save()}>Retry saving preferences</wa-button></div>` : nothing}
        ${this.busy && !this.oledProcessing ? html`<div class="progress" role="status"><wa-spinner></wa-spinner>${this.busy}</div>` : nothing}
        ${
          this.page === 'download' &&
          (this.naming.state === 'pending' || this.naming.state === 'failed')
            ? html`<div class="message" role="status" aria-live="polite">
                ${this.naming.state === 'pending' ? 'AI naming… You can edit or download now.' : this.naming.state === 'failed' ? html`${this.naming.message} <wa-button appearance="outlined" size="s" @click=${() => this.job && this.watchNaming(this.job.id, true)}>Retry AI naming</wa-button>` : nothing}
              </div>`
            : nothing
        }
        ${
          this.page !== 'input' &&
          this.prefs.method === 'ai' &&
          (this.detection.state === 'pending' ||
            this.detection.state === 'failed')
            ? html`<div class="message" role="status" aria-live="polite">
                ${
                  this.detection.state === 'pending'
                    ? 'Finding a subject… Using entropy crops for now.'
                    : this.detection.state === 'failed'
                      ? html`${this.detection.message}
                          <wa-button
                            appearance="outlined"
                            size="s"
                            @click=${() => this.job && this.watchDetection(this.job.id, true)}
                            >Retry subject detection</wa-button
                          >`
                      : nothing
                }
              </div>`
            : nothing
        }
        ${
          this.page === 'input'
            ? html`<div class="intro">
                  <h1>One wallpaper.<br />Every device.</h1>
                </div>
                <div class="input-layout">
                  <div
                    class="drop"
                    @dragover=${(e: DragEvent) => e.preventDefault()}
                    @drop=${(e: DragEvent) => {
                      e.preventDefault();
                      void this.upload([...e.dataTransfer!.files]);
                    }}
                  >
                    <h2>Drop or paste your wallpaper here</h2>
                    <label
                      ><span class="sr-only">Choose wallpaper</span
                      ><input
                        aria-label="Choose wallpaper"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        ?disabled=${!this.ready || !!this.busy}
                        @change=${(e: Event) => {
                          const input = e.target as HTMLInputElement;
                          void this.upload([...input.files!]);
                          input.value = '';
                        }}
                    /></label>
                    <p>JPEG, PNG, or WebP</p>
                    ${this.aiEnabled ? html`<p class="disclosure">AI enabled: an image representation is automatically sent to the configured AI service.</p>` : nothing}
                  </div>
                  <figure class="example">
                    <div class="example-image">
                      <img
                        src=${exampleWallpaper}
                        alt="Dusk Ridges shown with portrait and square crop boundaries"
                      />
                    </div>
                    <figcaption>Example framing</figcaption>
                  </figure>
                </div>`
            : nothing
        }
        ${
          this.page === 'processing' && j
            ? html`<h1 class="sr-only">Processing</h1>
                <div class="layout">
                  <aside class="panel">
                    <fieldset>
                      <legend>Output devices</legend>
                      <div class="options">
                        ${this.devices.map(
                          (d) =>
                            html`<label
                              ><input
                                type="checkbox"
                                .checked=${this.prefs.devices.includes(d.id)}
                                @change=${(e: Event) => {
                                  const checked = (e.target as HTMLInputElement)
                                    .checked;
                                  this.prefs = {
                                    ...this.prefs,
                                    devices: checked
                                      ? [...this.prefs.devices, d.id]
                                      : this.prefs.devices.filter(
                                          (id) => id !== d.id,
                                        ),
                                  };
                                  this.manuallyPositioned.delete(d.id);
                                  if (checked)
                                    this.crops = {
                                      ...this.crops,
                                      [d.id]: this.position(d),
                                    };
                                  else {
                                    const next = { ...this.crops };
                                    delete next[d.id];
                                    this.crops = next;
                                  }
                                  this.save();
                                  this.schedule();
                                }}
                              />${d.name}</label
                            >`,
                        )}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Crop method</legend>
                      <div class="crop-method">
                        <div class="smart-choices">
                          ${(['ai', 'entropy'] as const)
                            .filter(
                              (method) => method !== 'ai' || this.aiEnabled,
                            )
                            .map(
                              (method) =>
                                html` <label class="crop-choice smart-choice">
                                  <input
                                    type="radio"
                                    name="method"
                                    aria-label=${`Smart (${method === 'ai' ? 'AI' : 'entropy'})`}
                                    .checked=${this.prefs.method === method}
                                    @change=${() => {
                                      this.prefs = { ...this.prefs, method };
                                      this.save();
                                      this.resetAll();
                                    }}
                                  />
                                  <wa-icon
                                    src=${aiSparkles}
                                    aria-hidden="true"
                                  ></wa-icon>
                                  <span class="smart-label"
                                    >Smart
                                    <small
                                      >(${method === 'ai' ? 'AI' : 'entropy'})</small
                                    ></span
                                  >
                                </label>`,
                            )}
                        </div>

                        <div class="anchors">
                          ${(
                            [
                              'top-left',
                              'top-right',
                              'center',
                              'bottom-left',
                              'bottom-right',
                            ] as Anchor[]
                          ).map(
                            (a) =>
                              html`<label class="crop-choice ${a}">
                                <input
                                  type="radio"
                                  name="method"
                                  aria-label=${a.replace('-', ' ')}
                                  .checked=${this.prefs.method === 'anchor' && this.prefs.anchor === a}
                                  @change=${() => {
                                    this.prefs = {
                                      ...this.prefs,
                                      method: 'anchor',
                                      anchor: a,
                                    };
                                    this.save();
                                    this.resetAll();
                                  }}
                                /><span
                                  class="anchor-mark"
                                  aria-hidden="true"
                                ></span>
                                <span class="sr-only"
                                  >${a.replace('-', ' ')}</span
                                ></label
                              >`,
                          )}
                        </div>
                      </div>
                      ${this.prefs.method === 'ai' && this.detection.state === 'no-subject' ? html`<p class="meta" role="note">No clear subject. Using entropy crops.</p>` : nothing}
                    </fieldset>
                    <fieldset>
                      <legend>OLEDify</legend>
                      <label
                        ><input
                          type="checkbox"
                          .checked=${this.prefs.oled}
                          @change=${(e: Event) => {
                            this.prefs = {
                              ...this.prefs,
                              oled: (e.target as HTMLInputElement).checked,
                            };
                            this.save();
                            this.schedule();
                          }}
                        />
                        True black shadows</label
                      ><label for="threshold"
                        >Threshold: ${this.prefs.threshold}</label
                      ><input
                        id="threshold"
                        type="range"
                        min="0"
                        max="255"
                        step="1"
                        .value=${String(this.prefs.threshold)}
                        ?disabled=${!this.prefs.oled}
                        @input=${(e: Event) => {
                          const threshold = Number(
                            (e.target as HTMLInputElement).value,
                          );
                          if (threshold === this.prefs.threshold) return;
                          if (this.prefs.oled) this.oledProcessing = true;
                          this.prefs = {
                            ...this.prefs,
                            threshold,
                          };
                          this.save();
                          this.schedule();
                        }}
                      />
                    </fieldset>
                  </aside>
                  <section class="images" aria-label="Wallpaper framing">
                    <div class="source-wrap">
                      ${
                        this.manifest
                          ? html`<img
                                class="source"
                                src=${this.manifest.source}
                                alt="Source wallpaper preview"
                              />
                              <p class="meta">${j.width} × ${j.height}</p>`
                          : html`<p>Preparing your source preview…</p>`
                      }
                    </div>
                    <div class="cards">
                      ${this.selected.map((d) => {
                        const c = this.crops[d.id]!;
                        return html`<article class="card">
                          <h3>${d.name}</h3>
                          ${
                            this.manifest
                              ? html`<crop-editor
                                  .source=${this.manifest.source}
                                  .crop=${c}
                                  .imageWidth=${j.width}
                                  .imageHeight=${j.height}
                                  .label=${d.name}
                                  @crop-change=${(e: CustomEvent<Crop>) => {
                                    this.manuallyPositioned.add(d.id);
                                    this.crops = {
                                      ...this.crops,
                                      [d.id]: e.detail,
                                    };
                                    this.dirty = true;
                                    this.generation++;
                                  }}
                                  @crop-commit=${() => this.schedule()}
                                ></crop-editor>`
                              : nothing
                          }
                          <p class="meta">
                            ${d.width} ×
                            ${d.height}${c.width < d.width || c.height < d.height ? html`<br /><span class="warning">Upscaled; detail may look softer.</span>` : nothing}
                          </p>
                          <wa-button
                            appearance="outlined"
                            size="s"
                            @click=${() => {
                              this.manuallyPositioned.delete(d.id);
                              this.crops = {
                                ...this.crops,
                                [d.id]: this.position(d),
                              };
                              this.schedule();
                            }}
                            >Reset position</wa-button
                          >
                        </article>`;
                      })}
                    </div>
                    ${!this.selected.length ? html`<p role="status">Select at least one device to continue.</p>` : nothing}
                    <div class="actions">
                      <wa-button
                        variant="brand"
                        ?disabled=${!usable || !this.selected.length}
                        @click=${() => {
                          this.page = 'download';
                        }}
                        >Next: Download</wa-button
                      >
                    </div>
                  </section>
                </div>`
            : nothing
        }
        ${
          this.page === 'download' && j
            ? html`<h1 class="sr-only">Download</h1>
                <div class="delivery">
                  <label class="name"
                    >Wallpaper
                    name${this.naming.state === 'succeeded' && !this.nameEdited ? html`<wa-icon class="ai-indicator" src=${aiSparkles} label="AI Powered" title="AI Powered"></wa-icon>` : nothing}<input
                      type="text"
                      ?disabled=${this.busy === 'Saving wallpapers to server…'}
                      .value=${this.name}
                      @input=${(e: Event) => {
                        this.nameEdited = true;
                        this.serverSave = undefined;
                        this.name = (e.target as HTMLInputElement).value;
                      }}
                  /></label>
                  <div class="download-actions">
                    <label class="folder-choice"
                      ><input
                        type="checkbox"
                        ?disabled=${this.busy === 'Saving wallpapers to server…'}
                        .checked=${this.prefs.organizeIntoDeviceFolders}
                        @change=${(e: Event) => {
                          this.serverSave = undefined;
                          this.prefs = {
                            ...this.prefs,
                            organizeIntoDeviceFolders: (
                              e.target as HTMLInputElement
                            ).checked,
                          };
                          this.save();
                        }}
                      />
                      Organize into device folders</label
                    >
                    <wa-button
                      variant="brand"
                      ?disabled=${!usable}
                      @click=${() => this.download(`/api/jobs/${j.id}/zip/${this.manifest!.revision}?name=${encodeURIComponent(this.safeName())}&organizeIntoDeviceFolders=${this.prefs.organizeIntoDeviceFolders}`, `${this.safeName()}.zip`)}
                      >Download ZIP</wa-button
                    >
                    ${this.serverSavingEnabled ? html`<wa-button appearance="outlined" ?disabled=${!usable} @click=${() => this.saveToServer()}>Save to server</wa-button>` : nothing}
                  </div>
                </div>
                <section
                  class="save-feedback"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  ${this.busy === 'Saving wallpapers to server…' ? html`<p role="status"><wa-spinner aria-hidden="true"></wa-spinner> Saving wallpapers to server…</p>` : nothing}
                  ${
                    this.serverSave
                      ? html`
                          <p role="status">
                            ${this.serverSave.state === 'saved' ? 'Saved to' : this.serverSave.state === 'conflicts' ? 'Confirm replacement in' : 'Save incomplete.'}
                            ${this.serverSave.destination}
                          </p>
                          ${
                            this.serverSave.saved.length
                              ? html`<p>Saved files:</p>
                                  <ul>
                                    ${this.serverSave.saved.map((path) => html`<li>${path}</li>`)}
                                  </ul>`
                              : nothing
                          }
                          ${
                            this.serverSave.failed.length
                              ? html`<div role="alert">
                                  <p>Files not saved:</p>
                                  <ul>
                                    ${this.serverSave.failed.map((f) => html`<li>${f.path}: ${f.message}</li>`)}
                                  </ul>
                                </div>`
                              : nothing
                          }
                          ${
                            this.serverSave.state === 'conflicts' &&
                            this.saveSelection === this.currentSaveSelection()
                              ? html`
                                  <p>
                                    These files already exist. Replace them?
                                  </p>
                                  <ul>
                                    ${this.serverSave.conflicts.map((path) => html`<li>${path}</li>`)}
                                  </ul>
                                  <wa-button
                                    variant="brand"
                                    ?disabled=${!usable}
                                    @click=${() => this.saveToServer(true)}
                                    >Replace</wa-button
                                  >
                                  <wa-button
                                    appearance="outlined"
                                    ?disabled=${!!this.busy}
                                    @click=${() => {
                                      this.serverSave = undefined;
                                    }}
                                    >Cancel</wa-button
                                  >
                                `
                              : nothing
                          }
                        `
                      : nothing
                  }
                </section>
                <div class="cards">
                  ${this.selected.map((d) => {
                    const filename = `${this.safeName()}-${d.id}.png`;
                    return html`<article class="card">
                      <h3>${d.name}</h3>
                      ${usable ? html`<img class="output" src=${this.manifest!.outputs[d.id]!} alt=${`${d.name} final wallpaper`} />` : html`<p>Waiting for current output…</p>`}
                      <p class="meta">${filename}</p>
                      <wa-button
                        appearance="outlined"
                        ?disabled=${!usable}
                        @click=${() => this.download(this.manifest!.outputs[d.id]!, filename)}
                        >Download PNG</wa-button
                      >
                    </article>`;
                  })}
                </div>
                <div class="actions">
                  <wa-button
                    appearance="outlined"
                    ?disabled=${!!this.busy}
                    @click=${() => {
                      this.page = 'processing';
                    }}
                    >Back to Processing</wa-button
                  >
                </div>`
            : nothing
        }
      </main>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class=${this.oledProcessing ? 'oled-toast' : ''}
      >
        ${this.oledProcessing ? html`<wa-spinner aria-hidden="true"></wa-spinner><span>OLEDify processing…</span>` : nothing}
      </div>`;
  }
}
customElements.define('shin-app', ShinApp);
