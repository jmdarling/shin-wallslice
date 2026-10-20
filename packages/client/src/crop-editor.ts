import { LitElement, css, html } from 'lit';
import type { Crop } from '../../server/src/protocol.js';
export class CropEditor extends LitElement {
  static properties = {
    source: { type: String },
    crop: { attribute: false },
    imageWidth: { type: Number },
    imageHeight: { type: Number },
    label: { type: String },
  };
  source = '';
  crop: Crop = { left: 0, top: 0, width: 1, height: 1 };
  imageWidth = 1;
  imageHeight = 1;
  label = 'Crop';
  private drag: { x: number; y: number; left: number; top: number } | undefined;
  static styles = css`
    :host {
      display: block;
    }
    .surface {
      position: relative;
      line-height: 0;
      overflow: hidden;
      background: #17231f;
      touch-action: none;
    }
    img {
      width: 100%;
      display: block;
      pointer-events: none;
    }
    .crop {
      position: absolute;
      box-sizing: border-box;
      border: 2px solid white;
      box-shadow:
        inset 0 0 0 1px black,
        0 0 0 2000px #0007;
      cursor: move;
      touch-action: none;
      background: transparent;
      color: white;
      padding: 0;
    }
    .crop:focus-visible {
      outline: 4px solid #e7ba59;
      outline-offset: -6px;
      box-shadow:
        inset 0 0 0 8px black,
        0 0 0 2000px #0007;
    }
    span {
      position: absolute;
      top: 5px;
      left: 5px;
      background: #0009;
      padding: 5px;
      font-size: 12px;
      line-height: 1;
    }
  `;
  private move(left: number, top: number) {
    this.crop = {
      ...this.crop,
      left: Math.round(
        Math.max(0, Math.min(this.imageWidth - this.crop.width, left)),
      ),
      top: Math.round(
        Math.max(0, Math.min(this.imageHeight - this.crop.height, top)),
      ),
    };
    this.dispatchEvent(
      new CustomEvent('crop-change', {
        detail: this.crop,
        bubbles: true,
        composed: true,
      }),
    );
  }
  render() {
    const c = this.crop;
    return html`<div class="surface">
      <img src=${this.source} alt=${this.label} draggable="false" /><button
        class="crop"
        aria-label=${`Move ${this.label} crop. Drag or use arrow keys; Shift moves 10 pixels.`}
        style=${`left:${(c.left / this.imageWidth) * 100}%;top:${(c.top / this.imageHeight) * 100}%;width:${(c.width / this.imageWidth) * 100}%;height:${(c.height / this.imageHeight) * 100}%`}
        @pointerdown=${(e: PointerEvent) => {
          const button = e.currentTarget as HTMLElement;
          button.setPointerCapture(e.pointerId);
          this.drag = { x: e.clientX, y: e.clientY, left: c.left, top: c.top };
        }}
        @pointermove=${(e: PointerEvent) => {
          if (!this.drag) return;
          const rect = (
            e.currentTarget as HTMLElement
          ).parentElement!.getBoundingClientRect();
          this.move(
            this.drag.left +
              ((e.clientX - this.drag.x) * this.imageWidth) / rect.width,
            this.drag.top +
              ((e.clientY - this.drag.y) * this.imageHeight) / rect.height,
          );
        }}
        @pointerup=${() => {
          this.drag = undefined;
          this.dispatchEvent(
            new CustomEvent('crop-commit', { bubbles: true, composed: true }),
          );
        }}
        @pointercancel=${() => {
          this.drag = undefined;
          this.dispatchEvent(
            new CustomEvent('crop-commit', { bubbles: true, composed: true }),
          );
        }}
        @keydown=${(e: KeyboardEvent) => {
          const delta = e.shiftKey ? 10 : 1;
          if (
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
          ) {
            e.preventDefault();
            this.move(
              c.left +
                (e.key === 'ArrowLeft'
                  ? -delta
                  : e.key === 'ArrowRight'
                    ? delta
                    : 0),
              c.top +
                (e.key === 'ArrowUp'
                  ? -delta
                  : e.key === 'ArrowDown'
                    ? delta
                    : 0),
            );
            this.dispatchEvent(
              new CustomEvent('crop-commit', { bubbles: true, composed: true }),
            );
          }
        }}
      >
        <span>Drag to position</span>
      </button>
    </div>`;
  }
}
customElements.define('crop-editor', CropEditor);
