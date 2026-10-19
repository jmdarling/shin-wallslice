import { SignalWatcher } from '@lit-labs/signals';
import { clamp, LOW_CONFIDENCE_THRESHOLD, type NormRect } from '@shin-wallslice/core';
import { css, html, LitElement, nothing } from 'lit';
import { effectiveSubject, source, subjectOverride, subjectStatus } from '../state.js';
import { controls, panel } from '../styles/shared.js';

const METHOD_LABELS = {
  saliency: 'Subject detected',
  faces: 'Faces detected',
  attention: 'Best guess (heuristic)',
  center: 'No subject found — using center',
  manual: 'Manual subject',
} as const;

const MIN_BOX = 0.03;
const KEY_STEP = 0.01;

type DragMode = 'move' | 'resize';

/**
 * Shows the source with the subject overlay. Dragging the box moves it, dragging the corner
 * handle resizes it; either creates a global subject override that applies to every target.
 */
export class SwSourceView extends SignalWatcher(LitElement) {
  static override properties = {
    showOverlay: { state: true },
  };

  declare showOverlay: boolean;

  private drag:
    | { mode: DragMode; pointerId: number; startX: number; startY: number; startBox: NormRect }
    | undefined;

  constructor() {
    super();
    this.showOverlay = true;
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
      .stage {
        position: relative;
        margin: 0 auto;
        max-width: 100%;
        line-height: 0;
        background: var(--sw-preview-bg);
        border-radius: var(--sw-radius-sm);
        overflow: hidden;
        touch-action: none;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        user-select: none;
        -webkit-user-drag: none;
      }
      .box {
        position: absolute;
        border: 2px solid var(--sw-subject);
        background: var(--sw-subject-fill);
        cursor: move;
        border-radius: 2px;
      }
      .box:focus-visible {
        outline: 2px solid var(--sw-focus);
        outline-offset: 2px;
      }
      .handle {
        position: absolute;
        right: -9px;
        bottom: -9px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--sw-subject);
        border: 2px solid var(--sw-surface);
        cursor: nwse-resize;
      }
      .focal {
        position: absolute;
        width: 12px;
        height: 12px;
        margin: -6px 0 0 -6px;
        border-radius: 50%;
        background: var(--sw-subject);
        border: 2px solid var(--sw-surface);
        pointer-events: none;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sw-space-2);
        justify-content: space-between;
      }
      .meta .left {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sw-space-2);
        align-items: center;
      }
      label.toggle {
        display: inline-flex;
        gap: var(--sw-space-2);
        align-items: center;
        font-size: var(--sw-text-sm);
      }
    `,
  ];

  override render() {
    const current = source.get();
    if (!current) return nothing;
    const subject = effectiveSubject.get();
    const status = subjectStatus.get();
    const aspect = `${current.proxyWidth} / ${current.proxyHeight}`;

    return html`
      <div class="panel">
        <div
          class="stage"
          style="aspect-ratio: ${aspect}; max-height: 60vh; width: min(100%, calc(60vh * ${current.proxyWidth} / ${current.proxyHeight}))"
        >
          <img src=${current.proxyUrl} alt="Source wallpaper" draggable="false" />
          ${
            subject && this.showOverlay
              ? html`
                  <div
                    class="box"
                    role="slider"
                    tabindex="0"
                    aria-label="Subject area. Drag or use arrow keys to move; Shift + arrows to resize."
                    aria-valuetext=${`x ${Math.round(subject.box.x * 100)}%, y ${Math.round(subject.box.y * 100)}%`}
                    style=${this.boxStyle(subject.box)}
                    @pointerdown=${(e: PointerEvent) => this.startDrag(e, 'move')}
                    @pointermove=${this.onPointerMove}
                    @pointerup=${this.endDrag}
                    @pointercancel=${this.endDrag}
                    @keydown=${this.onKeyDown}
                  >
                    <div
                      class="handle"
                      @pointerdown=${(e: PointerEvent) => this.startDrag(e, 'resize')}
                    ></div>
                  </div>
                  <div
                    class="focal"
                    style="left: ${subject.focal.x * 100}%; top: ${subject.focal.y * 100}%"
                  ></div>
                `
              : nothing
          }
        </div>
        <div class="meta">
          <div class="left">
            ${
              status === 'loading'
                ? html`<span class="badge">Finding the subject…</span>`
                : subject
                  ? html`<span class="badge ${subject.method === 'manual' ? 'info' : ''}"
                        >${METHOD_LABELS[subject.method]}</span
                      >
                      ${
                        subject.method !== 'manual' && subject.confidence < LOW_CONFIDENCE_THRESHOLD
                          ? html`<span class="badge warning"
                              >Low confidence — check the crops</span
                            >`
                          : nothing
                      }`
                  : nothing
            }
            <span class="muted">${current.width} × ${current.height}</span>
          </div>
          <div class="left">
            <label class="toggle">
              <input
                type="checkbox"
                .checked=${this.showOverlay}
                @change=${(e: Event) => (this.showOverlay = (e.target as HTMLInputElement).checked)}
              />
              Show subject
            </label>
            ${
              subjectOverride.get()
                ? html`<button class="ghost" @click=${() => subjectOverride.set(undefined)}>
                    Reset to auto
                  </button>`
                : nothing
            }
          </div>
        </div>
      </div>
    `;
  }

  private boxStyle(box: NormRect): string {
    return `left: ${box.x * 100}%; top: ${box.y * 100}%; width: ${box.width * 100}%; height: ${box.height * 100}%`;
  }

  private setBox(box: NormRect) {
    const width = clamp(box.width, MIN_BOX, 1);
    const height = clamp(box.height, MIN_BOX, 1);
    const next = {
      x: clamp(box.x, 0, 1 - width),
      y: clamp(box.y, 0, 1 - height),
      width,
      height,
    };
    subjectOverride.set({
      box: next,
      focal: { x: next.x + next.width / 2, y: next.y + next.height / 2 },
    });
  }

  private startDrag(event: PointerEvent, mode: DragMode) {
    const subject = effectiveSubject.get();
    if (!subject) return;
    event.stopPropagation();
    event.preventDefault();
    const box = this.renderRoot.querySelector<HTMLElement>('.box');
    box?.setPointerCapture(event.pointerId);
    this.drag = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startBox: subject.box,
    };
  }

  private onPointerMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = this.renderRoot.querySelector<HTMLElement>('.stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const start = drag.startBox;
    if (drag.mode === 'move') {
      this.setBox({ ...start, x: start.x + dx, y: start.y + dy });
    } else {
      this.setBox({
        ...start,
        width: clamp(start.width + dx, MIN_BOX, 1 - start.x),
        height: clamp(start.height + dy, MIN_BOX, 1 - start.y),
      });
    }
  }

  private endDrag(event: PointerEvent) {
    if (this.drag?.pointerId === event.pointerId) this.drag = undefined;
  }

  private onKeyDown(event: KeyboardEvent) {
    const subject = effectiveSubject.get();
    if (!subject) return;
    const delta = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta as [number, number];
    const box = subject.box;
    if (event.shiftKey) {
      this.setBox({ ...box, width: box.width + dx, height: box.height + dy });
    } else {
      this.setBox({ ...box, x: box.x + dx, y: box.y + dy });
    }
  }
}

customElements.define('sw-source-view', SwSourceView);

declare global {
  interface HTMLElementTagNameMap {
    'sw-source-view': SwSourceView;
  }
}
