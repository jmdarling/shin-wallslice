import { SignalWatcher } from '@lit-labs/signals';
import {
  clamp,
  computeCrop,
  LOW_CONFIDENCE_THRESHOLD,
  MIN_ZOOM,
  type CropOverride,
  type CropResult,
} from '@shin-wallslice/core';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { downloadOne } from '../actions.js';
import { loadImage } from '../image-cache.js';
import {
  busy,
  clearCropOverride,
  cropOverrides,
  effectiveSubject,
  removeTarget,
  selectedTargets,
  setCropOverride,
  showGuides,
  source,
} from '../state.js';
import { controls, panel } from '../styles/shared.js';

const PAN_KEY_STEP = 0.02;
const ZOOM_STEP = 1.1;

/**
 * Live preview of one target, rendered client-side from the proxy with the shared crop math so it
 * matches the export exactly. Drag to pan, scroll / pinch / +/- to zoom.
 */
export class SwTargetCard extends SignalWatcher(LitElement) {
  static override properties = {
    targetKey: { type: String, attribute: 'target-key' },
  };

  declare targetKey: string;

  private image: HTMLImageElement | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance: number | undefined;

  constructor() {
    super();
    this.targetKey = '';
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
        gap: var(--sw-space-2);
        height: 100%;
        align-content: start;
      }
      .frame {
        display: grid;
        place-items: center;
        background: var(--sw-preview-bg);
        border-radius: var(--sw-radius-sm);
        padding: var(--sw-space-2);
        height: 280px;
      }
      canvas {
        display: block;
        max-width: 100%;
        max-height: 100%;
        border-radius: 4px;
        cursor: grab;
        touch-action: none;
      }
      canvas:active {
        cursor: grabbing;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: var(--sw-space-2);
      }
      h3 {
        margin: 0;
        font-size: var(--sw-text);
      }
      .size {
        font-family: var(--sw-font-mono);
        font-size: var(--sw-text-sm);
        color: var(--sw-text-muted);
      }
      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-1);
        min-height: 24px;
      }
      .actions {
        display: flex;
        gap: var(--sw-space-2);
        flex-wrap: wrap;
      }
    `,
  ];

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => this.draw());
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
  }

  private get target() {
    return selectedTargets.get().find((t) => t.resolved.key === this.targetKey);
  }

  private get override(): CropOverride {
    return cropOverrides.get()[this.targetKey] ?? {};
  }

  private crop(): CropResult | undefined {
    const current = source.get();
    const subject = effectiveSubject.get();
    const target = this.target;
    if (!current || !subject || !target) return undefined;
    return computeCrop(current, subject, target.resolved.outputSize, this.override);
  }

  override render() {
    const target = this.target;
    if (!target) return nothing;
    const crop = this.crop();
    const subject = effectiveSubject.get();
    const { outputSize, label, rotates } = target.resolved;
    const adjusted = this.targetKey in cropOverrides.get();
    // Read guides so toggling them redraws.
    showGuides.get();

    return html`
      <article class="panel" aria-label=${label}>
        <header>
          <div>
            <h3>${label}</h3>
            <span class="size"
              >${outputSize.width} × ${outputSize.height}${rotates ? ' · square' : ''}</span
            >
          </div>
          <button
            class="ghost icon"
            aria-label="Remove ${label}"
            title="Remove"
            @click=${() => removeTarget(this.targetKey)}
          >
            ×
          </button>
        </header>
        <div class="frame">
          <canvas
            tabindex="0"
            role="img"
            aria-label="Preview for ${label}. Drag or use arrow keys to pan, plus and minus to zoom."
            @pointerdown=${this.onPointerDown}
            @pointermove=${this.onPointerMove}
            @pointerup=${this.onPointerUp}
            @pointercancel=${this.onPointerUp}
            @wheel=${this.onWheel}
            @keydown=${this.onKeyDown}
          ></canvas>
        </div>
        <div class="badges">
          ${
            crop?.upscaled
              ? html`<span class="badge warning" title="The source is smaller than this screen"
                  >Upscaled ${crop.scale.toFixed(1)}× — may look soft</span
                >`
              : nothing
          }
          ${crop?.subjectClipped ? html`<span class="badge warning">Subject doesn’t fully fit</span>` : nothing}
          ${
            subject &&
            subject.method !== 'manual' &&
            subject.confidence < LOW_CONFIDENCE_THRESHOLD &&
            !adjusted
              ? html`<span class="badge warning">Check this crop</span>`
              : nothing
          }
          ${adjusted ? html`<span class="badge info">Adjusted</span>` : nothing}
        </div>
        <div class="actions">
          <button ?disabled=${!crop || !!busy.get()} @click=${() => downloadOne(this.targetKey)}>
            Download
          </button>
          ${adjusted ? html`<button class="ghost" @click=${() => clearCropOverride(this.targetKey)}>Reset to auto</button>` : nothing}
        </div>
      </article>
    `;
  }

  override firstUpdated() {
    const canvas = this.canvas;
    if (canvas?.parentElement) this.resizeObserver?.observe(canvas.parentElement);
  }

  override updated(changed: PropertyValues) {
    super.updated(changed);
    const url = source.get()?.proxyUrl;
    if (url && this.image?.src !== new URL(url, location.href).href) {
      this.image = undefined;
      void loadImage(url).then((image) => {
        this.image = image;
        this.draw();
      });
    }
    this.draw();
  }

  private get canvas() {
    return this.renderRoot.querySelector('canvas');
  }

  private draw() {
    const canvas = this.canvas;
    const frame = canvas?.parentElement;
    const crop = this.crop();
    const current = source.get();
    const target = this.target;
    if (!canvas || !frame || !crop || !current || !target) return;

    // Fit the output aspect ratio inside the frame.
    const styles = getComputedStyle(frame);
    const availableWidth =
      frame.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const availableHeight =
      frame.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    const aspect = crop.outputSize.width / crop.outputSize.height;
    const cssWidth = Math.max(1, Math.min(availableWidth, availableHeight * aspect));
    const cssHeight = cssWidth / aspect;
    const ratio = window.devicePixelRatio || 1;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);

    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.image) return;

    const scale = current.proxyWidth / current.width;
    const { rect } = crop;
    context.drawImage(
      this.image,
      rect.x * scale,
      rect.y * scale,
      rect.width * scale,
      rect.height * scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    if (target.resolved.rotates && showGuides.get())
      this.drawOrientationGuides(context, canvas, target.resolved.resolution);
  }

  /** Dashed outlines of what the device shows in portrait and landscape. */
  private drawOrientationGuides(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    resolution: { width: number; height: number },
  ) {
    const short =
      Math.min(resolution.width, resolution.height) / Math.max(resolution.width, resolution.height);
    const portraitWidth = canvas.width * short;
    const landscapeHeight = canvas.height * short;
    const ratio = window.devicePixelRatio || 1;
    context.save();
    context.setLineDash([6 * ratio, 4 * ratio]);
    context.lineWidth = 1.5 * ratio;
    const guide = getComputedStyle(this).getPropertyValue('--sw-guide').trim() || 'white';
    const shadow = getComputedStyle(this).getPropertyValue('--sw-guide-shadow').trim() || 'black';
    context.shadowColor = shadow;
    context.shadowBlur = 3 * ratio;
    context.strokeStyle = guide;
    context.strokeRect((canvas.width - portraitWidth) / 2, 0.5, portraitWidth, canvas.height - 1);
    context.strokeRect(
      0.5,
      (canvas.height - landscapeHeight) / 2,
      canvas.width - 1,
      landscapeHeight,
    );
    context.restore();
  }

  // --- Interaction -----------------------------------------------------------------

  /** Current crop center in normalized source coordinates. */
  private currentCenter(crop: CropResult) {
    const current = source.get()!;
    return {
      x: (crop.rect.x + crop.rect.width / 2) / current.width,
      y: (crop.rect.y + crop.rect.height / 2) / current.height,
    };
  }

  private pan(dxCss: number, dyCss: number) {
    const crop = this.crop();
    const canvas = this.canvas;
    const current = source.get();
    if (!crop || !canvas || !current) return;
    const sourcePerCss = crop.rect.width / canvas.clientWidth;
    const center = this.currentCenter(crop);
    setCropOverride(this.targetKey, {
      ...this.override,
      center: {
        x: clamp(center.x - (dxCss * sourcePerCss) / current.width, 0, 1),
        y: clamp(center.y - (dyCss * sourcePerCss) / current.height, 0, 1),
      },
    });
  }

  private zoomBy(factor: number) {
    const crop = this.crop();
    if (!crop) return;
    const zoom = clamp((this.override.zoom ?? 1) / factor, MIN_ZOOM, 1);
    setCropOverride(this.targetKey, { center: this.currentCenter(crop), zoom });
  }

  private onPointerDown(event: PointerEvent) {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchDistance = undefined;
  }

  private onPointerMove(event: PointerEvent) {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, next);

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance) this.zoomBy(distance / this.pinchDistance);
      this.pinchDistance = distance;
      return;
    }
    this.pan(next.x - previous.x, next.y - previous.y);
  }

  private onPointerUp(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    this.pinchDistance = undefined;
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    this.zoomBy(Math.exp(-event.deltaY * 0.002));
  }

  private onKeyDown(event: KeyboardEvent) {
    const canvas = this.canvas;
    if (!canvas) return;
    const step = canvas.clientWidth * PAN_KEY_STEP * 5;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.pan(step, 0),
      ArrowRight: () => this.pan(-step, 0),
      ArrowUp: () => this.pan(0, step),
      ArrowDown: () => this.pan(0, -step),
      '+': () => this.zoomBy(ZOOM_STEP),
      '=': () => this.zoomBy(ZOOM_STEP),
      '-': () => this.zoomBy(1 / ZOOM_STEP),
      '0': () => clearCropOverride(this.targetKey),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }
}

customElements.define('sw-target-card', SwTargetCard);

declare global {
  interface HTMLElementTagNameMap {
    'sw-target-card': SwTargetCard;
  }
}
