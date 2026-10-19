import { SignalWatcher } from '@lit-labs/signals';
import { slugify } from '@shin-wallslice/core';
import { css, html, LitElement, nothing } from 'lit';
import { canShareFiles, downloadAll, saveToOutput, shareAll, suggestName } from '../actions.js';
import { baseName, busy, config, effectiveSubject, nameStatus, selectedTargets, source } from '../state.js';
import { controls, panel } from '../styles/shared.js';

/** Name field (with optional AI suggestion) and the export actions. */
export class SwExportBar extends SignalWatcher(LitElement) {
  private readonly shareSupported = canShareFiles();

  static override styles = [
    controls,
    panel,
    css`
      :host {
        display: block;
      }
      .panel {
        padding: var(--sw-space-3);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sw-space-3);
      }
      .name {
        display: flex;
        align-items: center;
        gap: var(--sw-space-2);
        flex: 1 1 320px;
        min-width: 0;
      }
      .name input {
        flex: 1;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-2);
      }
      .hint {
        font-size: var(--sw-text-sm);
        width: 100%;
      }
      code {
        font-family: var(--sw-font-mono);
      }
    `,
  ];

  override render() {
    const current = source.get();
    const appConfig = config.get();
    const count = selectedTargets.get().length;
    const ready = Boolean(current && effectiveSubject.get() && count > 0);
    const working = busy.get();
    const disabled = !ready || Boolean(working);
    const fileName = slugify(baseName.get() || current?.baseName || 'wallpaper');

    return html`
      <div class="panel">
        <div class="name">
          <label for="name">Name</label>
          <input
            id="name"
            type="text"
            maxlength="120"
            .value=${baseName.get()}
            placeholder=${current?.baseName ?? 'wallpaper'}
            @input=${(e: Event) => baseName.set((e.target as HTMLInputElement).value)}
          />
          ${appConfig?.namingEnabled
            ? html`<button
                ?disabled=${!current || nameStatus.get() === 'loading'}
                @click=${() => suggestName()}
                title="Ask the configured AI model for a descriptive name"
              >
                ${nameStatus.get() === 'loading' ? 'Suggesting…' : 'Suggest'}
              </button>`
            : nothing}
        </div>
        <div class="actions">
          <button class="primary" ?disabled=${disabled} @click=${() => downloadAll()}>
            ${count > 1 ? `Download ZIP (${count})` : 'Download'}
          </button>
          ${appConfig?.outputVolumeAvailable
            ? html`<button ?disabled=${disabled} @click=${() => saveToOutput()}>Save to output folder</button>`
            : nothing}
          ${this.shareSupported
            ? html`<button ?disabled=${disabled} @click=${() => shareAll()}>Share…</button>`
            : nothing}
        </div>
        <span class="hint muted" aria-live="polite">
          ${working
            ? working
            : count === 0
              ? 'Select at least one device.'
              : html`Files are named <code>${fileName}.png</code> inside a folder per device${appConfig?.outputVolumeAvailable
                  ? '; saving overwrites files with the same name'
                  : ''}.`}
        </span>
      </div>
    `;
  }
}

customElements.define('sw-export-bar', SwExportBar);

declare global {
  interface HTMLElementTagNameMap {
    'sw-export-bar': SwExportBar;
  }
}
