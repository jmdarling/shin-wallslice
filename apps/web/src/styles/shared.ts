import { css } from 'lit';

/** Shared control styles, adopted by components that render buttons and inputs. */
export const controls = css`
  button,
  .button {
    font: inherit;
    font-size: var(--sw-text-sm);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sw-space-2);
    min-height: 36px;
    padding: 0 var(--sw-space-4);
    border-radius: var(--sw-radius-sm);
    border: 1px solid var(--sw-border);
    background: var(--sw-surface);
    color: var(--sw-text-color);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: var(--sw-surface-2);
  }
  button.primary {
    background: var(--sw-accent);
    border-color: var(--sw-accent);
    color: var(--sw-accent-text);
  }
  button.primary:hover:not(:disabled) {
    background: var(--sw-accent-hover);
  }
  button.ghost {
    background: transparent;
    border-color: transparent;
  }
  button.icon {
    padding: 0;
    width: 32px;
    min-height: 32px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  input[type='text'],
  input[type='url'],
  input[type='search'],
  input[type='number'] {
    font: inherit;
    min-height: 36px;
    padding: 0 var(--sw-space-3);
    border-radius: var(--sw-radius-sm);
    border: 1px solid var(--sw-border);
    background: var(--sw-surface);
    color: var(--sw-text-color);
    min-width: 0;
  }
  :focus-visible {
    outline: 2px solid var(--sw-focus);
    outline-offset: 2px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--sw-space-1);
    font-size: var(--sw-text-sm);
    padding: 2px var(--sw-space-2);
    border-radius: 999px;
    background: var(--sw-surface-2);
    color: var(--sw-text-muted);
  }
  .badge.warning {
    background: var(--sw-warning-bg);
    color: var(--sw-warning-text);
  }
  .badge.info {
    background: var(--sw-info-bg);
    color: var(--sw-info-text);
  }
  .muted {
    color: var(--sw-text-muted);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
`;

export const panel = css`
  .panel {
    background: var(--sw-surface);
    border: 1px solid var(--sw-border);
    border-radius: var(--sw-radius);
    box-shadow: var(--sw-shadow);
  }
`;
