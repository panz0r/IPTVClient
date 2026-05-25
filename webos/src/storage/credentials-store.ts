import type { XtreamCredentials } from '../api/xtream';

const KEY = 'xtream_credentials';

export function loadCredentials(): XtreamCredentials | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as XtreamCredentials;
    if (json.serverUrl && json.username && json.password) {
      return json;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveCredentials(credentials: XtreamCredentials): void {
  localStorage.setItem(KEY, JSON.stringify(credentials));
}

export function clearCredentials(): void {
  localStorage.removeItem(KEY);
}
