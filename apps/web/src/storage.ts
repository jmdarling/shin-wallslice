// Browser localStorage is for UI conveniences only (AGENTS.md rule 5).
// Every access is guarded: storage can be unavailable (private mode, blocked site data).

const PREFIX = 'shin-wallslice:';

export function load<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore: persistence is best-effort.
  }
}
