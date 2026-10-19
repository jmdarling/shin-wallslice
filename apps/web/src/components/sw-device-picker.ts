import { SignalWatcher } from '@lit-labs/signals';
import {
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  deviceOutputSize,
  deviceRotates,
  isValidCustomDimension,
  type Device,
  type DeviceCategory,
} from '@shin-wallslice/core';
import { css, html, LitElement, nothing } from 'lit';
import { addCustomTarget, devices, removeTarget, selectedTargets, toggleDevice } from '../state.js';
import { controls, panel } from '../styles/shared.js';

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: 'Phones',
  tablet: 'Tablets',
  laptop: 'Laptops',
  desktop: 'Desktops',
  monitor: 'Monitors',
  other: 'Other',
};

function matches(device: Device, query: string): boolean {
  if (!query) return true;
  const haystack = [device.name, device.brand, device.category, String(device.year ?? ''), ...(device.aliases ?? [])]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

/** Searchable device list grouped by category and brand, plus ad-hoc custom sizes. */
export class SwDevicePicker extends SignalWatcher(LitElement) {
  static override properties = {
    query: { state: true },
    customError: { state: true },
  };

  declare query: string;
  declare customError: string;

  constructor() {
    super();
    this.query = '';
    this.customError = '';
  }

  static override styles = [
    controls,
    panel,
    css`
      :host {
        display: block;
      }
      .panel {
        padding: var(--sw-space-3);
        display: grid;
        gap: var(--sw-space-3);
      }
      h2 {
        margin: 0;
        font-size: var(--sw-text-lg);
      }
      header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--sw-space-2);
      }
      input[type='search'] {
        width: 100%;
      }
      .list {
        max-height: 420px;
        overflow: auto;
        display: grid;
        gap: var(--sw-space-3);
        padding-right: var(--sw-space-1);
      }
      fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 2px;
      }
      legend {
        font-size: var(--sw-text-sm);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--sw-text-muted);
        padding: 0 0 var(--sw-space-1);
      }
      label.device {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--sw-space-2);
        padding: 6px var(--sw-space-2);
        border-radius: var(--sw-radius-sm);
        cursor: pointer;
      }
      label.device:hover {
        background: var(--sw-surface-2);
      }
      .size {
        font-family: var(--sw-font-mono);
        font-size: var(--sw-text-sm);
        color: var(--sw-text-muted);
      }
      .brand {
        color: var(--sw-text-muted);
        font-size: var(--sw-text-sm);
      }
      details {
        border-top: 1px solid var(--sw-border);
        padding-top: var(--sw-space-3);
      }
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      form.custom {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-2);
        align-items: center;
        margin-top: var(--sw-space-3);
      }
      form.custom input[type='number'] {
        width: 96px;
      }
      form.custom input[type='text'] {
        flex: 1 1 140px;
      }
      .error {
        color: var(--sw-danger-text);
        font-size: var(--sw-text-sm);
        width: 100%;
      }
      .customs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-2);
        margin-top: var(--sw-space-2);
      }
    `,
  ];

  override render() {
    const selectedKeys = new Set(selectedTargets.get().map((t) => t.resolved.key));
    const visible = devices.get().filter((device) => matches(device, this.query.trim()));
    const groups = new Map<DeviceCategory, Device[]>();
    for (const device of visible) {
      groups.set(device.category, [...(groups.get(device.category) ?? []), device]);
    }
    const customs = selectedTargets.get().filter((t) => t.spec.kind === 'custom');

    return html`
      <div class="panel">
        <header>
          <h2>Devices</h2>
          <span class="muted">${selectedKeys.size} selected</span>
        </header>
        <label class="visually-hidden" for="search">Search devices</label>
        <input
          id="search"
          type="search"
          placeholder="Search devices, brands, years…"
          .value=${this.query}
          @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
        />
        <div class="list">
          ${[...groups].map(
            ([category, items]) => html`
              <fieldset>
                <legend>${CATEGORY_LABELS[category]}</legend>
                ${items.map((device) => this.renderDevice(device, selectedKeys.has(device.id)))}
              </fieldset>
            `,
          )}
          ${visible.length === 0 ? html`<p class="muted">No devices match “${this.query}”.</p>` : nothing}
        </div>
        <details>
          <summary>Custom size</summary>
          <form class="custom" @submit=${this.onCustomSubmit}>
            <label class="visually-hidden" for="w">Width</label>
            <input id="w" name="width" type="number" min=${CUSTOM_SIZE_MIN} max=${CUSTOM_SIZE_MAX} placeholder="Width" required />
            <span aria-hidden="true">×</span>
            <label class="visually-hidden" for="h">Height</label>
            <input id="h" name="height" type="number" min=${CUSTOM_SIZE_MIN} max=${CUSTOM_SIZE_MAX} placeholder="Height" required />
            <label class="visually-hidden" for="label">Label</label>
            <input id="label" name="label" type="text" placeholder="Label (optional)" maxlength="80" />
            <label class="device" style="grid-template-columns: auto auto">
              <input type="checkbox" name="rotates" /> Rotates (square)
            </label>
            <button type="submit">Add</button>
            ${this.customError ? html`<span class="error" role="alert">${this.customError}</span>` : nothing}
          </form>
          ${customs.length > 0
            ? html`<div class="customs">
                ${customs.map(
                  (t) => html`<span class="badge"
                    >${t.resolved.label}
                    <button
                      class="ghost icon"
                      aria-label="Remove ${t.resolved.label}"
                      @click=${() => removeTarget(t.resolved.key)}
                    >
                      ×
                    </button></span
                  >`,
                )}
              </div>`
            : nothing}
        </details>
      </div>
    `;
  }

  private renderDevice(device: Device, checked: boolean) {
    const output = deviceOutputSize(device);
    return html`
      <label class="device">
        <input
          type="checkbox"
          .checked=${checked}
          @change=${(e: Event) => toggleDevice(device.id, (e.target as HTMLInputElement).checked)}
        />
        <span>${device.name} <span class="brand">${device.brand === 'Generic' ? '' : device.brand}</span></span>
        <span class="size" title=${deviceRotates(device) ? 'Square output for both orientations' : ''}
          >${output.width}×${output.height}${deviceRotates(device) ? ' ⟳' : ''}</span
        >
      </label>
    `;
  }

  private onCustomSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const width = Number(data.get('width'));
    const height = Number(data.get('height'));
    if (!isValidCustomDimension(width) || !isValidCustomDimension(height)) {
      this.customError = `Width and height must be whole numbers from ${CUSTOM_SIZE_MIN} to ${CUSTOM_SIZE_MAX}.`;
      return;
    }
    const label = String(data.get('label') ?? '').trim();
    addCustomTarget({
      kind: 'custom',
      width,
      height,
      rotates: data.get('rotates') === 'on',
      ...(label ? { label } : {}),
    });
    this.customError = '';
    form.reset();
  }
}

customElements.define('sw-device-picker', SwDevicePicker);

declare global {
  interface HTMLElementTagNameMap {
    'sw-device-picker': SwDevicePicker;
  }
}
