import { css, html, LitElement } from 'lit';
import { controls } from '../styles/shared.js';

/**
 * Empty-state input: drag and drop, file picker, or URL. (Paste is handled app-wide by sw-app.)
 * Emits `sw-file` ({ file }) and `sw-url` ({ url }).
 */
export class SwDropZone extends LitElement {
  static override properties = {
    compact: { type: Boolean, reflect: true },
    disabled: { type: Boolean },
    maxUploadMb: { type: Number, attribute: 'max-upload-mb' },
    dragging: { state: true },
  };

  declare compact: boolean;
  declare disabled: boolean;
  declare maxUploadMb: number;
  declare dragging: boolean;

  constructor() {
    super();
    this.compact = false;
    this.disabled = false;
    this.maxUploadMb = 100;
    this.dragging = false;
  }

  static override styles = [
    controls,
    css`
      :host {
        display: block;
      }
      .zone {
        display: grid;
        place-items: center;
        gap: var(--sw-space-4);
        padding: var(--sw-space-6) var(--sw-space-4);
        min-height: 320px;
        border: 2px dashed var(--sw-border);
        border-radius: var(--sw-radius-lg);
        background: var(--sw-surface);
        text-align: center;
        transition:
          border-color 120ms,
          background 120ms;
      }
      :host([compact]) .zone {
        min-height: 0;
        padding: var(--sw-space-4);
      }
      .zone.dragging {
        border-color: var(--sw-accent);
        background: var(--sw-info-bg);
      }
      h2 {
        margin: 0;
        font-size: var(--sw-text-xl);
      }
      :host([compact]) h2 {
        font-size: var(--sw-text-lg);
      }
      p {
        margin: 0;
      }
      form {
        display: flex;
        gap: var(--sw-space-2);
        width: min(520px, 100%);
      }
      form input {
        flex: 1;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-3);
        align-items: center;
        justify-content: center;
      }
      kbd {
        font-family: var(--sw-font-mono);
        font-size: var(--sw-text-sm);
        padding: 1px 6px;
        border: 1px solid var(--sw-border);
        border-radius: 4px;
        background: var(--sw-surface-2);
      }
    `,
  ];

  override render() {
    return html`
      <div
        class="zone ${this.dragging ? 'dragging' : ''}"
        @dragover=${this.onDragOver}
        @dragleave=${this.onDragLeave}
        @drop=${this.onDrop}
      >
        <h2>${this.compact ? 'Replace the image' : 'Drop a wallpaper here'}</h2>
        <div class="row">
          <button class="primary" ?disabled=${this.disabled} @click=${this.pick}>
            Choose a file
          </button>
          <span class="muted">or paste with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>V</kbd></span>
        </div>
        <form @submit=${this.onUrlSubmit}>
          <label class="visually-hidden" for="url">Image URL</label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="…or paste an image URL"
            required
            ?disabled=${this.disabled}
          />
          <button type="submit" ?disabled=${this.disabled}>Fetch</button>
        </form>
        <p class="muted">JPEG, PNG, WebP or AVIF · up to ${this.maxUploadMb} MB</p>
        <input
          id="file"
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          tabindex="-1"
          @change=${this.onFileChange}
        />
      </div>
    `;
  }

  private pick() {
    this.renderRoot.querySelector<HTMLInputElement>('#file')?.click();
  }

  private emitFile(file: File) {
    this.dispatchEvent(
      new CustomEvent('sw-file', { detail: { file }, bubbles: true, composed: true }),
    );
  }

  private onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.emitFile(file);
    input.value = '';
  }

  private onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging = true;
  }

  private onDragLeave() {
    this.dragging = false;
  }

  private onDrop(event: DragEvent) {
    event.preventDefault();
    // sw-app also handles drops anywhere on the page; don't upload twice.
    event.stopPropagation();
    this.dragging = false;
    if (this.disabled) return;
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.emitFile(file);
      return;
    }
    const url =
      event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain');
    if (url)
      this.dispatchEvent(
        new CustomEvent('sw-url', { detail: { url }, bubbles: true, composed: true }),
      );
  }

  private onUrlSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const url = new FormData(form).get('url');
    if (typeof url === 'string' && url.trim()) {
      this.dispatchEvent(
        new CustomEvent('sw-url', { detail: { url: url.trim() }, bubbles: true, composed: true }),
      );
      form.reset();
    }
  }
}

customElements.define('sw-drop-zone', SwDropZone);

declare global {
  interface HTMLElementTagNameMap {
    'sw-drop-zone': SwDropZone;
  }
}
