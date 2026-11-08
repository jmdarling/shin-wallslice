import {
  css,
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from 'lit';
import { repeat } from 'lit/directives/repeat.js';

export type Activity = {
  id: string;
  label: string;
  state: 'working' | 'completed' | 'attention' | 'failed';
  detail?: string;
  scope?: 'app' | undefined;
  action?: { label: string; run: () => unknown } | undefined;
  details?: TemplateResult;
  dismissed?: boolean | undefined;
};
const labels = {
  working: 'Working',
  completed: 'Completed',
  attention: 'Needs attention',
  failed: 'Failed',
};
export class ActivityDock implements ReactiveController {
  entries: Activity[] = [];
  expanded = false;
  private polite = '';
  private urgent = '';
  private showNewestError = false;
  hostUpdated() {
    if (this.showNewestError && this.host instanceof HTMLElement) {
      const list = this.host.shadowRoot?.querySelector('.activity-list');
      if (list) list.scrollTop = 0;
      this.showNewestError = false;
    }
  }
  constructor(private host: ReactiveControllerHost) {
    host.addController(this);
  }
  set(entry: Activity) {
    const old = this.entries.find((e) => e.id === entry.id);
    const changed =
      !old ||
      old.state !== entry.state ||
      old.label !== entry.label ||
      old.detail !== entry.detail;
    this.entries = old
      ? this.entries.map((e) =>
          e.id === entry.id
            ? { ...entry, dismissed: changed ? false : e.dismissed }
            : e,
        )
      : [...this.entries, entry];
    if (changed) {
      const message = `${entry.label}. ${labels[entry.state]}. ${entry.detail ?? ''}`;
      if (entry.state === 'failed' || entry.state === 'attention') {
        this.entries = [
          this.entries.find((e) => e.id === entry.id)!,
          ...this.entries.filter((e) => e.id !== entry.id),
        ];
        this.urgent = message;
        this.showNewestError = true;
      } else {
        if (old?.state === 'failed' || old?.state === 'attention')
          this.urgent = '';
        this.polite = message;
      }
    }
    this.host.requestUpdate();
  }
  reset() {
    this.entries = this.entries
      .filter(
        (e) =>
          e.scope === 'app' &&
          (e.state === 'failed' ||
            e.state === 'attention' ||
            e.state === 'working'),
      )
      .map((e) => ({ ...e, dismissed: false }));
    this.expanded = false;
    this.polite = '';
    this.urgent = '';
    this.host.requestUpdate();
  }
  remove(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.host.requestUpdate();
  }
  render() {
    const working = this.entries.filter((e) => e.state === 'working').length;
    const errors = this.entries.filter(
      (e) => e.state === 'failed' || e.state === 'attention',
    ).length;
    const priority = { failed: 0, attention: 0, working: 1, completed: 2 };
    const visible = this.entries
      .filter((e) => !e.dismissed)
      .toSorted((a, b) => priority[a.state] - priority[b.state]);
    const summary =
      [
        errors
          ? `${errors} ${errors === 1 ? 'item needs' : 'items need'} attention`
          : '',
        working
          ? `${working} ${working === 1 ? 'activity' : 'activities'} in progress`
          : '',
      ]
        .filter(Boolean)
        .join(' · ') ||
      (visible.length ? 'All activities complete' : 'No recent activity');
    return html`<section class="activity-dock" aria-label="Activity">
        <div id="activity-list" class="activity-list" ?hidden=${!this.expanded}>
          ${
            visible.length
              ? repeat(
                  visible,
                  (e) => e.id,
                  (e) =>
                    html`<article
                      class="activity-entry"
                      data-activity=${e.id}
                      data-state=${e.state}
                    >
                      <span class="activity-symbol" aria-hidden="true"
                        >${e.state === 'working' ? html`<wa-spinner></wa-spinner>` : e.state === 'completed' ? '✓' : '!'}</span
                      >
                      <div class="activity-copy">
                        <strong>${e.label}</strong
                        ><span class="activity-state">${labels[e.state]}</span>
                        ${e.detail ? html`<p>${e.detail}</p>` : nothing}
                        ${e.action ? html`<wa-button size="s" appearance="outlined" @click=${e.action.run}>${e.action.label}</wa-button>` : nothing}
                        ${e.details ?? nothing}
                      </div>
                      ${
                        e.state !== 'working'
                          ? html`<wa-button
                              size="s"
                              appearance="plain"
                              aria-label=${`Dismiss ${e.label}`}
                              @click=${() => {
                                e.dismissed = true;
                                this.host.requestUpdate();
                              }}
                              ><span aria-hidden="true">×</span
                              ><span class="activity-sr-only"
                                >${`Dismiss ${e.label}`}</span
                              ></wa-button
                            >`
                          : nothing
                      }
                    </article>`,
                )
              : html`<p class="activity-empty">No recent activity.</p>`
          }
          ${
            this.entries.some((e) => e.dismissed)
              ? html`<wa-button
                  appearance="plain"
                  size="s"
                  @click=${() => {
                    this.entries.forEach((e) => (e.dismissed = false));
                    this.host.requestUpdate();
                  }}
                  >Show dismissed activity</wa-button
                >`
              : nothing
          }
        </div>
        <button
          class="activity-summary"
          aria-expanded=${this.expanded}
          aria-controls="activity-list"
          @click=${() => {
            this.expanded = !this.expanded;
            this.host.requestUpdate();
          }}
        >
          <span class="activity-summary-label"
            >${working ? html`<wa-spinner aria-hidden="true"></wa-spinner>` : nothing}${summary}</span
          ><span>${this.expanded ? 'Collapse' : 'Expand'}</span>
        </button>
      </section>
      <div
        class="activity-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        ${this.polite}
      </div>
      <div class="activity-announcement" role="alert" aria-atomic="true">
        ${this.urgent}
      </div>`;
  }
}
export const activityStyles = css`
  .activity-dock {
    position: sticky;
    bottom: 1rem;
    z-index: 10;
    width: min(32rem, calc(100% - 2rem));
    margin: 1rem auto;
    color: var(--app-text);
    background: var(--app-panel);
    border: 1px solid var(--app-panel-border);
    border-radius: 12px;
    box-shadow: 0 6px 24px var(--app-shadow);
    overflow: hidden;
  }
  .activity-list {
    max-height: min(26rem, 45dvh);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .activity-list[hidden] {
    display: none;
  }
  .activity-entry {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    padding: 1rem;
    border-bottom: 1px solid var(--app-panel-border);
  }
  .activity-copy {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .activity-copy strong {
    display: block;
  }
  .activity-copy p {
    margin: 0.3rem 0 0.6rem;
    font-size: 0.875rem;
  }
  .activity-state {
    font-size: 0.75rem;
    color: var(--app-muted);
  }
  .activity-symbol {
    color: var(--app-accent);
    width: 1.2rem;
    flex-shrink: 0;
  }
  .activity-summary {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    min-height: 48px;
    border: 0;
    background: var(--app-selected);
    color: var(--app-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .activity-summary-label {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .activity-summary-label wa-spinner {
    display: inline-flex;
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .activity-summary-label wa-spinner::part(spinner) {
      animation: none;
    }
  }
  .activity-summary:focus-visible {
    outline: 3px solid var(--app-focus);
    outline-offset: -4px;
  }
  .activity-empty {
    padding: 1rem;
  }
  .activity-announcement,
  .activity-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .activity-copy details {
    margin-top: 0.5rem;
  }
  .activity-copy summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    text-decoration: underline;
  }
  .activity-copy ul {
    padding-left: 1.2rem;
  }
  @media (pointer: coarse) {
    .activity-entry wa-button::part(base) {
      min-height: 44px;
      min-width: 44px;
    }
  }
`;
