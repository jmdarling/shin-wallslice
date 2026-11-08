import { afterEach, expect, test, vi } from 'vitest';
import { LitElement } from 'lit';
import { ActivityDock, activityStyles } from './activity-dock.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import './style.css';
class DockHarness extends LitElement {
  dock = new ActivityDock(this);
  static styles = activityStyles;
  render() {
    return this.dock.render();
  }
}
customElements.define('dock-harness', DockHarness);
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});
async function setup() {
  const host = new DockHarness();
  document.body.append(host);
  await host.updateComplete;
  return host;
}
const summary = (host: DockHarness) =>
  host.shadowRoot!.querySelector<HTMLButtonElement>('.activity-summary')!;

test('coalesces repeated work, counts concurrent tasks, and retains completed history', async () => {
  const h = await setup();
  h.dock.set({ id: 'render', label: 'Rendering', state: 'working' });
  h.dock.set({ id: 'ai', label: 'AI naming', state: 'working' });
  h.dock.set({ id: 'render', label: 'Rendering', state: 'working' });
  await h.updateComplete;
  expect(h.dock.entries).toHaveLength(2);
  expect(summary(h).textContent).toContain('2 activities in progress');
  expect(summary(h).getAttribute('aria-expanded')).toBe('false');
  h.dock.set({ id: 'render', label: 'Wallpapers ready', state: 'completed' });
  await h.updateComplete;
  expect(summary(h).textContent).toContain('1 activity in progress');
  expect(h.dock.entries).toHaveLength(2);
});

test('only user actions expand or collapse the dock, with a spinner during work', async () => {
  const h = await setup();
  vi.useFakeTimers();
  summary(h).focus();
  for (const state of [
    'working',
    'completed',
    'failed',
    'attention',
  ] as const) {
    h.dock.set({ id: 'task', label: 'Task', state });
    await h.updateComplete;
    expect(h.dock.expanded).toBe(false);
    expect(!!summary(h).querySelector('wa-spinner')).toBe(state === 'working');
    expect(h.shadowRoot!.activeElement).toBe(summary(h));
  }
  summary(h).click();
  h.dock.set({ id: 'task', label: 'Task', state: 'working' });
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.dock.expanded).toBe(true);
  h.dock.set({ id: 'task', label: 'Task', state: 'completed' });
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.dock.expanded).toBe(true);
  summary(h).click();
  h.dock.set({ id: 'task', label: 'Task', state: 'failed' });
  expect(h.dock.expanded).toBe(false);
});

test('dismissal keeps errors unresolved and Start over retains only app failures', async () => {
  const h = await setup();
  h.dock.set({
    id: 'prefs',
    label: 'Preferences failed',
    state: 'failed',
    scope: 'app',
  });
  h.dock.set({ id: 'render', label: 'Ready', state: 'completed' });
  await h.updateComplete;
  h.shadowRoot!.querySelector<HTMLElement>(
    '[aria-label="Dismiss Preferences failed"]',
  )!.click();
  await h.updateComplete;
  expect(h.dock.entries.find((e) => e.id === 'prefs')?.dismissed).toBe(true);
  expect(summary(h).textContent).toContain('1 item needs attention');
  h.dock.reset();
  await h.updateComplete;
  expect(h.dock.entries.map((e) => e.id)).toEqual(['prefs']);
  expect(h.dock.entries[0]?.dismissed).toBe(false);
  expect(h.dock.expanded).toBe(false);
  h.remove();
  const fresh = await setup();
  expect(fresh.dock.entries).toEqual([]);
});
