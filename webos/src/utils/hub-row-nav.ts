import { appState } from '../state/app-state';

export const HUB_ROW_INITIAL_VISIBLE = 12;
export const HUB_ROW_LOAD_STEP = 8;

let pendingHubRowFocusKey: string | null = null;

export function consumePendingHubRowFocusKey(): string | null {
  const key = pendingHubRowFocusKey;
  pendingHubRowFocusKey = null;
  return key;
}

export function scrollPosterIntoView(poster: HTMLElement): void {
  const row = poster.closest('.horizontal-poster-row') as HTMLElement | null;
  if (!row) return;

  const rowRect = row.getBoundingClientRect();
  const elRect = poster.getBoundingClientRect();
  const margin = 24;

  if (elRect.right > rowRect.right - margin) {
    row.scrollLeft += elRect.right - rowRect.right + margin;
  } else if (elRect.left < rowRect.left + margin) {
    row.scrollLeft -= rowRect.left - elRect.left + margin;
  }
}

/** When focused on the last visible poster, load more titles in that row. */
export function tryExpandHubRowFromPoster(poster: HTMLElement): boolean {
  if (appState.screen.name !== 'home') return false;
  const tab = appState.screen.tab;
  if (tab !== 'movies' && tab !== 'series') return false;

  const section = poster.closest('.hub-row[data-row-id]') as HTMLElement | null;
  if (!section) return false;

  const rowId = section.dataset.rowId;
  if (!rowId) return false;

  const rowEl = poster.closest('.horizontal-poster-row');
  if (!rowEl) return false;

  const items = Array.from(rowEl.querySelectorAll<HTMLElement>('.poster-card'));
  const idx = items.indexOf(poster);
  if (idx < 0 || idx !== items.length - 1) return false;

  const focusKey = appState.expandHubRow(rowId, tab);
  if (!focusKey) return false;

  pendingHubRowFocusKey = focusKey;
  return true;
}

export function hubRowPosterSlice<T>(
  rowId: string,
  items: T[],
): T[] {
  const count = appState.getHubRowVisibleCount(rowId);
  return items.slice(0, count);
}
