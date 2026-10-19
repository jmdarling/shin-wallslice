import { LitElement, css, html } from 'lit';
import '@awesome.me/webawesome/dist/components/badge/badge.js';

export class ShinApp extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    header {
      padding: 1.5rem clamp(1.25rem, 6vw, 5rem);
      border-bottom: 1px solid #ceddce;
      font-weight: 650;
      letter-spacing: -0.025em;
    }
    main {
      max-width: 54rem;
      margin: 0 auto;
      padding: clamp(3rem, 12vw, 9rem) 1.5rem;
    }
    .eyebrow {
      font-size: 0.8rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #54715f;
    }
    h1 {
      font-size: clamp(2.75rem, 8vw, 5rem);
      line-height: 1.08;
      letter-spacing: -0.055em;
      margin: 1.25rem 0;
      font-weight: 600;
    }
    p {
      max-width: 34rem;
      line-height: 1.7;
      font-size: 1.1rem;
      color: #486351;
    }
    section {
      border-top: 1px solid #ceddce;
      margin-top: 3rem;
      padding-top: 1.5rem;
    }
    section p {
      font-size: 0.95rem;
    }
  `;
  render() {
    return html`
      <header>shin-wallslice</header>
      <main>
        <div class="eyebrow">A home for every screen</div>
        <h1>One wallpaper.<br />Every device.</h1>
        <p>
          A little space for your favorite views. Wallpaper cropping and
          organization are on the way.
        </p>
        <section aria-label="Development status">
          <wa-badge variant="brand" pill>Foundation · v0.1.0</wa-badge>
          <p>
            The foundation is ready. Wallpaper tools will arrive in a future
            version.
          </p>
        </section>
      </main>
    `;
  }
}
customElements.define('shin-app', ShinApp);
