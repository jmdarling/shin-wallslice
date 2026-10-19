import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { loadInitial, uploadFile, uploadUrl } from '../actions.js';
import {
  config,
  selectedTargets,
  setShowGuides,
  setTheme,
  showGuides,
  source,
  sourceStatus,
  theme,
  toast,
  type Theme,
} from '../state.js';
import { controls } from '../styles/shared.js';
import './sw-device-picker.js';
import './sw-drop-zone.js';
import './sw-export-bar.js';
import './sw-source-view.js';
import './sw-target-card.js';

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theme: system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/** Application shell: one page, live previews. */
export class SwApp extends SignalWatcher(LitElement) {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
        min-height: 100vh;
      }
      header.top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sw-space-3);
        padding: var(--sw-space-3) var(--sw-space-4);
        border-bottom: 1px solid var(--sw-border);
        background: var(--sw-surface);
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .brand {
        display: flex;
        align-items: baseline;
        gap: var(--sw-space-3);
      }
      h1 {
        margin: 0;
        white-space: nowrap;
        font-size: var(--sw-text-lg);
        letter-spacing: -0.01em;
      }
      main {
        max-width: 1600px;
        margin: 0 auto;
        padding: var(--sw-space-4);
        display: grid;
        gap: var(--sw-space-4);
      }
      .workspace {
        display: grid;
        grid-template-columns: minmax(300px, 420px) 1fr;
        gap: var(--sw-space-4);
        align-items: start;
      }
      .sidebar {
        display: grid;
        gap: var(--sw-space-4);
      }
      .previews {
        display: grid;
        gap: var(--sw-space-3);
      }
      .previews-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--sw-space-2);
      }
      .previews-header h2 {
        margin: 0;
        font-size: var(--sw-text-lg);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--sw-space-3);
      }
      .empty {
        padding: var(--sw-space-6);
        text-align: center;
        border: 1px dashed var(--sw-border);
        border-radius: var(--sw-radius);
      }
      sw-export-bar {
        position: sticky;
        bottom: var(--sw-space-3);
        z-index: 1;
      }
      .toast {
        position: fixed;
        left: 50%;
        bottom: var(--sw-space-5);
        transform: translateX(-50%);
        max-width: min(560px, calc(100vw - 32px));
        padding: var(--sw-space-3) var(--sw-space-4);
        border-radius: var(--sw-radius);
        box-shadow: var(--sw-shadow);
        background: var(--sw-info-bg);
        color: var(--sw-info-text);
        z-index: 10;
      }
      .toast.error {
        background: var(--sw-danger-bg);
        color: var(--sw-danger-text);
      }
      .loading {
        padding: var(--sw-space-6);
        text-align: center;
      }
      label.toggle {
        display: inline-flex;
        gap: var(--sw-space-2);
        align-items: center;
        font-size: var(--sw-text-sm);
      }
      @media (max-width: 860px) {
        .workspace {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 600px) {
        .tagline {
          display: none;
        }
      }
    `,
  ];

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('paste', this.onPaste);
    window.addEventListener('dragover', this.preventDefault);
    window.addEventListener('drop', this.onWindowDrop);
    void loadInitial();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('paste', this.onPaste);
    window.removeEventListener('dragover', this.preventDefault);
    window.removeEventListener('drop', this.onWindowDrop);
  }

  override render() {
    const current = source.get();
    const status = sourceStatus.get();
    const notice = toast.get();
    const targets = selectedTargets.get();
    const currentTheme = theme.get();
    const loading = status === 'loading';

    return html`
      <header class="top">
        <div class="brand">
          <h1>shin-wallslice</h1>
          <span class="muted tagline">Form-fit wallpapers to every device</span>
        </div>
        <button
          class="ghost"
          @click=${() => setTheme(NEXT_THEME[currentTheme])}
          aria-label=${THEME_LABEL[currentTheme]}
        >
          ${THEME_LABEL[currentTheme]}
        </button>
      </header>
      <main @sw-file=${this.onFileEvent} @sw-url=${this.onUrlEvent}>
        ${
          !current
            ? loading
              ? html`<div class="loading" role="status">Loading image…</div>`
              : html`<sw-drop-zone
                  max-upload-mb=${config.get()?.limits.maxUploadMb ?? 100}
                ></sw-drop-zone>`
            : html`
                <div class="workspace">
                  <div class="sidebar">
                    <sw-source-view></sw-source-view>
                    <sw-device-picker></sw-device-picker>
                    <sw-drop-zone compact ?disabled=${loading}></sw-drop-zone>
                  </div>
                  <section class="previews" aria-label="Previews">
                    <div class="previews-header">
                      <h2>Previews</h2>
                      <label class="toggle">
                        <input
                          type="checkbox"
                          .checked=${showGuides.get()}
                          @change=${(e: Event) => setShowGuides((e.target as HTMLInputElement).checked)}
                        />
                        Orientation guides
                      </label>
                    </div>
                    ${
                      targets.length === 0
                        ? html`<div class="empty muted">
                            Pick one or more devices to see previews.
                          </div>`
                        : html`<div class="grid">
                            ${repeat(
                              targets,
                              (t) => t.resolved.key,
                              (t) =>
                                html`<sw-target-card
                                  target-key=${t.resolved.key}
                                ></sw-target-card>`,
                            )}
                          </div>`
                    }
                    <sw-export-bar></sw-export-bar>
                  </section>
                </div>
              `
        }
      </main>
      ${
        notice
          ? html`<div
              class="toast ${notice.kind}"
              role=${notice.kind === 'error' ? 'alert' : 'status'}
            >
              ${notice.message}
            </div>`
          : nothing
      }
    `;
  }

  private readonly preventDefault = (event: Event) => event.preventDefault();

  private readonly onWindowDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && sourceStatus.get() !== 'loading') void uploadFile(file);
  };

  private readonly onPaste = (event: ClipboardEvent) => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const items = [...(event.clipboardData?.items ?? [])];
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (file) {
      event.preventDefault();
      void uploadFile(file);
      return;
    }
    const text = event.clipboardData?.getData('text/plain').trim();
    if (text && /^https?:\/\//i.test(text)) {
      event.preventDefault();
      void uploadUrl(text);
    }
  };

  private onFileEvent(event: CustomEvent<{ file: File }>) {
    event.stopPropagation();
    void uploadFile(event.detail.file);
  }

  private onUrlEvent(event: CustomEvent<{ url: string }>) {
    event.stopPropagation();
    void uploadUrl(event.detail.url);
  }
}

customElements.define('sw-app', SwApp);

declare global {
  interface HTMLElementTagNameMap {
    'sw-app': SwApp;
  }
}
