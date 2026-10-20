import { LitElement, css, html, nothing } from 'lit';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import './crop-editor.js';
import type {
  Anchor,
  Crop,
  Device,
  Job,
  Manifest,
  Preferences,
} from '../../server/src/protocol.js';

type Catalog = {
  devices: Device[];
  preferences: Preferences;
  preferenceError: string;
};
export class ShinApp extends LitElement {
  static properties = {
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
      this.devices = catalog.devices;
      this.prefs = catalog.preferences;
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
      this.page = 'processing';
      this.resetAll();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = '';
      if (this.job) this.schedule();
    }
  }
  private position(d: Device): Crop {
    const j = this.job!;
    if (this.prefs.method === 'smart') return { ...j.smart[d.id]! };
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
    this.crops = Object.fromEntries(
      this.selected.map((d) => [d.id, this.position(d)]),
    );
    this.schedule();
  }
  private get selected() {
    return this.devices.filter((d) => this.prefs.devices.includes(d.id));
  }
  private schedule() {
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
      this.generation++;
      this.job = undefined;
      this.manifest = undefined;
      this.crops = {};
      this.name = '';
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
  static styles = css`
    :host {
      display: block;
      color: #19392d;
      --wa-color-brand-fill-loud: #246348;
    }
    header {
      padding: 1.3rem clamp(1rem, 5vw, 4rem);
      border-bottom: 1px solid #cbd8cd;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    header strong {
      font-size: 1.2rem;
      letter-spacing: -0.04em;
    }
    main {
      max-width: 1200px;
      margin: auto;
      padding: 2rem clamp(1rem, 4vw, 3rem);
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.8rem);
      letter-spacing: -0.05em;
      line-height: 1.05;
      margin: 0.6rem 0 1.5rem;
    }
    h2 {
      font-size: 1.2rem;
    }
    p {
      line-height: 1.6;
      color: #496454;
    }
    .eyebrow {
      font-size: 0.8rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #58745f;
    }
    .input {
      max-width: 760px;
      padding-top: clamp(2rem, 10vh, 6rem);
    }
    .drop {
      border: 2px dashed #789c82;
      border-radius: 1rem;
      background: #fff8;
      text-align: center;
      padding: 3rem 1rem;
      margin: 2rem 0;
    }
    .drop:focus-within {
      outline: 3px solid #246348;
    }
    .drop input {
      display: block;
      max-width: 100%;
      margin: 1rem auto;
    }
    input,
    select {
      font: inherit;
      accent-color: #246348;
    }
    input[type='text'] {
      box-sizing: border-box;
      width: 100%;
      padding: 0.8rem;
      border: 1px solid #789c82;
      border-radius: 0.4rem;
      background: white;
    }
    input[type='range'] {
      width: 100%;
    }
    label {
      line-height: 1.6;
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 3px solid #246348;
      outline-offset: 3px;
    }
    .layout {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 2rem;
    }
    .panel,
    .card {
      background: #fff9;
      border: 1px solid #d0ded1;
      border-radius: 0.8rem;
      padding: 1.1rem;
    }
    .panel {
      align-self: start;
    }
    .options {
      display: grid;
      gap: 0.7rem;
    }
    .options label {
      display: flex;
      gap: 0.6rem;
      align-items: start;
    }
    .anchors {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.4rem;
      margin: 0.7rem 0;
    }
    .anchors label {
      border: 1px solid #b7cbbd;
      border-radius: 0.4rem;
      padding: 0.3rem;
      font-size: 0.85rem;
    }
    .anchors label:has(:checked) {
      background: #d4e7d6;
      border-color: #246348;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
      gap: 1rem;
    }
    .source {
      max-width: 100%;
      max-height: 340px;
      object-fit: contain;
      display: block;
      margin: auto;
    }
    .source-wrap {
      background: #dce6dc;
      border-radius: 0.6rem;
      padding: 0.7rem;
      margin-bottom: 1.5rem;
    }
    .output {
      display: block;
      max-width: 100%;
      height: 230px;
      object-fit: contain;
      margin: auto;
    }
    .card h3 {
      font-size: 1rem;
      margin: 0.2rem 0 1rem;
    }
    .meta {
      font-size: 0.85rem;
    }
    .warning {
      color: #7b4b10;
    }
    .message {
      border: 1px solid #b46c4b;
      background: #fff2e9;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.8rem;
      background: #deebdf;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }
    .download-actions {
      margin-bottom: 1.5rem;
    }
    .oled-toast {
      position: fixed;
      inset: auto 1rem max(1rem, env(safe-area-inset-bottom)) auto;
      z-index: 10;
      box-sizing: border-box;
      max-width: calc(100vw - 2rem);
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 1rem;
      border: 1px solid #789c82;
      border-radius: 0.6rem;
      background: #deebdf;
      box-shadow: 0 4px 18px #19392d26;
      pointer-events: none;
    }
    .oled-toast wa-spinner {
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      gap: 0.8rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 1.5rem;
    }
    .step {
      font-size: 0.8rem;
      color: #58745f;
    }
    .name {
      max-width: 36rem;
      display: block;
      margin: 1.5rem 0;
    }
    wa-button {
      margin: 0.15rem 0;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 1.4rem 0;
    }
    fieldset > label {
      display: block;
      margin: 0.4rem 0;
    }
    .anchors label {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }
    legend {
      font-weight: 650;
      margin-bottom: 0.6rem;
    }
    .stale {
      opacity: 0.55;
    }
    @media (max-width: 720px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .panel .options {
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      }
      header {
        align-items: center;
        flex-wrap: wrap;
      }
      header strong {
        white-space: nowrap;
      }
      header .step {
        order: 3;
        flex-basis: 100%;
        max-width: none;
        text-align: left;
      }
      .step {
        max-width: 7rem;
        text-align: right;
      }
    }
  `;
  render() {
    const j = this.job;
    const usable = !!this.manifest && !this.dirty && !this.busy;
    return html` <header>
        <strong>shin-wallslice</strong
        ><span class="step">Input → Processing → Download</span
        >${this.page !== 'input' ? html`<wa-button size="s" ?disabled=${!!this.busy} @click=${() => this.startOver()}>Start over</wa-button>` : nothing}
      </header>
      <main class=${this.page === 'input' ? 'input' : ''}>
        ${this.error ? html`<div class="message" role="alert">${this.error} <wa-button size="s" @click=${() => (this.job ? this.renderPreviews() : this.load())}>Retry</wa-button></div>` : nothing}
        ${this.preferenceError ? html`<div class="message" role="alert">${this.preferenceError}<wa-button size="s" @click=${() => this.save()}>Retry saving preferences</wa-button></div>` : nothing}
        ${this.busy && !this.oledProcessing ? html`<div class="progress" role="status"><wa-spinner></wa-spinner>${this.busy}</div>` : nothing}
        ${
          this.page === 'input'
            ? html`<div class="eyebrow">A home for every screen</div>
                <h1>One wallpaper.<br />Every device.</h1>
                <p>
                  Choose your favorite view. Position it for your screens, tune
                  the shadows, and download wallpapers that fit.
                </p>
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
                    >Or choose one image<input
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
                  <p>JPEG, PNG, or WebP · processed locally on your server</p>
                </div>`
            : nothing
        }
        ${
          this.page === 'processing' && j
            ? html`<div class="eyebrow">02 / Make it fit</div>
                <h1>A view for every screen.</h1>
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
                      <label
                        ><input
                          type="radio"
                          name="method"
                          .checked=${this.prefs.method === 'smart'}
                          @change=${() => {
                            this.prefs = { ...this.prefs, method: 'smart' };
                            this.save();
                            this.resetAll();
                          }}
                        />
                        Smart (entropy)</label
                      >
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
                            html`<label
                              ><input
                                type="radio"
                                name="method"
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
                              />${a.replace('-', ' ')}</label
                            >`,
                        )}
                      </div>
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
                        Turn near-black colors into true black</label
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
                      <p class="meta">
                        All RGB channels at or below the threshold become black.
                      </p>
                    </fieldset>
                  </aside>
                  <section>
                    <div class="source-wrap">
                      ${this.manifest ? html`<img class="source" src=${this.manifest.source} alt="Source wallpaper preview" />` : html`<p>Preparing your source preview…</p>`}
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
                            ${d.height}${c.width < d.width || c.height < d.height ? html`<br /><span class="warning">This crop will be upscaled; detail may look softer.</span>` : nothing}
                          </p>
                          <wa-button
                            size="s"
                            @click=${() => {
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
            ? html`<div class="eyebrow">03 / Take it with you</div>
                <h1>Ready for your screens.</h1>
                <label class="name"
                  >Wallpaper name<input
                    type="text"
                    .value=${this.name}
                    @input=${(e: Event) => {
                      this.name = (e.target as HTMLInputElement).value;
                    }}
                /></label>
                <label
                  ><input
                    type="checkbox"
                    .checked=${this.prefs.organizeIntoDeviceFolders}
                    @change=${(e: Event) => {
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
                <div class="download-actions">
                  <wa-button
                    variant="brand"
                    ?disabled=${!usable}
                    @click=${() => this.download(`/api/jobs/${j.id}/zip/${this.manifest!.revision}?name=${encodeURIComponent(this.safeName())}&organizeIntoDeviceFolders=${this.prefs.organizeIntoDeviceFolders}`, `${this.safeName()}.zip`)}
                    >Download all: ${this.safeName()}.zip</wa-button
                  >
                </div>
                <div class="cards">
                  ${this.selected.map((d) => {
                    const filename = `${this.safeName()}-${d.id}.png`;
                    return html`<article class="card">
                      <h3>${d.name}</h3>
                      ${usable ? html`<img class="output" src=${this.manifest!.outputs[d.id]!} alt=${`${d.name} final wallpaper`} />` : html`<p>Waiting for current output…</p>`}
                      <p class="meta">${filename}</p>
                      <wa-button
                        ?disabled=${!usable}
                        @click=${() => this.download(this.manifest!.outputs[d.id]!, filename)}
                        >Download PNG</wa-button
                      >
                    </article>`;
                  })}
                </div>
                <div class="actions">
                  <wa-button
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
        ${this.oledProcessing ? html`<wa-spinner aria-hidden="true"></wa-spinner><span>OLEDify processing… Updating previews and downloads.</span>` : nothing}
      </div>`;
  }
}
customElements.define('shin-app', ShinApp);
