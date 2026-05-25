/** D-pad / remote focus management for 10-foot TV UI. */

import { openSearchEditor } from '../utils/search-field';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), .focusable';

const ZONE_ORDER = ['header', 'banner', 'content', 'tabs'] as const;
type ZoneId = (typeof ZONE_ORDER)[number];

export function initFocusRoot(root: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      const current = document.activeElement as HTMLElement | null;
      const next = findNextFocusable(root, current, key);
      if (next) {
        event.preventDefault();
        next.focus();
      }
      return;
    }

    if (key === 'Enter' || event.keyCode === 13 || event.keyCode === 28) {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return;

      const searchInputId = el.dataset.searchInput;
      if (searchInputId && el.classList.contains('search-field--tv')) {
        event.preventDefault();
        const wrap = el.closest('.search-field-wrap');
        const input = root.querySelector<HTMLInputElement>(`#${searchInputId}`);
        if (wrap && input instanceof HTMLInputElement) {
          openSearchEditor(wrap, el as HTMLButtonElement, input);
        }
        return;
      }

      if (el.classList.contains('focusable') && el.dataset.clickable === 'true') {
        event.preventDefault();
        el.click();
      }
    }
  };

  root.addEventListener('keydown', onKeyDown);
  return () => root.removeEventListener('keydown', onKeyDown);
}

function findNextFocusable(
  root: HTMLElement,
  current: HTMLElement | null,
  key: string,
): HTMLElement | null {
  const all = visibleFocusables(root);
  if (all.length === 0) return null;

  if (!current || !all.includes(current)) {
    return pickDefaultFocus(root, all);
  }

  const pool = buildPool(all, current, key);
  const next = pickDirectional(current, pool, key);

  if (!next && (key === 'ArrowUp' || key === 'ArrowDown')) {
    return pickCrossZone(current, all, key);
  }

  if (!next && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    return pickEdgeFallback(current, all, key);
  }

  return next;
}

function buildPool(
  all: HTMLElement[],
  current: HTMLElement,
  key: string,
): HTMLElement[] {
  const horizontalRow = current.closest('.horizontal-poster-row');
  if (horizontalRow && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    return all.filter((el) => horizontalRow.contains(el));
  }

  const sub = subZone(current);
  if (sub === 'sidebar') {
    if (key === 'ArrowRight') {
      return all.filter((el) => subZone(el) === 'catalog');
    }
    return all.filter((el) => subZone(el) === 'sidebar');
  }

  if (sub === 'catalog') {
    if (key === 'ArrowLeft') {
      return all.filter((el) => subZone(el) === 'sidebar');
    }
    return all.filter((el) => subZone(el) === 'catalog' || subZone(el) === 'content');
  }

  if (sub === 'content' || sub === 'hub') {
    return all.filter((el) => {
      const z = subZone(el);
      return z === 'content' || z === 'hub';
    });
  }

  const zone = topZone(current);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return all.filter((el) => topZone(el) === zone);
  }

  return all.filter((el) => topZone(el) === zone);
}

function pickDirectional(
  current: HTMLElement,
  pool: HTMLElement[],
  key: string,
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const horizontalRow = current.closest('.horizontal-poster-row');
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const candidate of pool) {
    if (candidate === current) continue;
    const rect = candidate.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2);
    const dy = rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2);

    const minPrimary = horizontalRow ? 4 : 8;
    if (key === 'ArrowLeft' && dx >= -minPrimary) continue;
    if (key === 'ArrowRight' && dx <= minPrimary) continue;
    if (key === 'ArrowUp' && dy >= -minPrimary) continue;
    if (key === 'ArrowDown' && dy <= minPrimary) continue;

    const primary =
      key === 'ArrowLeft' || key === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
    let secondary =
      key === 'ArrowLeft' || key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);

    if (horizontalRow && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      secondary *= 10;
    }

    const score = primary * 1000 + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function pickCrossZone(
  current: HTMLElement,
  all: HTMLElement[],
  key: string,
): HTMLElement | null {
  const sub = subZone(current);

  if (key === 'ArrowDown' && sub === 'sidebar') {
    const catalogPool = all.filter((el) => subZone(el) === 'catalog');
    return nearestByHorizontal(current, catalogPool);
  }

  if (key === 'ArrowDown' && (sub === 'catalog' || sub === 'hub')) {
    const tabPool = all.filter((el) => topZone(el) === 'tabs');
    return nearestByHorizontal(current, tabPool);
  }

  if (key === 'ArrowUp' && (sub === 'catalog' || sub === 'hub' || sub === 'sidebar')) {
    const bannerPool = all.filter((el) => topZone(el) === 'banner');
    if (bannerPool.length > 0) {
      return nearestByHorizontal(current, bannerPool);
    }
    const headerPool = all.filter((el) => topZone(el) === 'header');
    if (headerPool.length > 0) {
      return nearestByHorizontal(current, headerPool);
    }
  }

  if (key === 'ArrowUp' && topZone(current) === 'tabs') {
    const contentPool = all.filter((el) => {
      const z = subZone(el);
      return z === 'catalog' || z === 'hub' || z === 'sidebar';
    });
    if (contentPool.length > 0) {
      return nearestByVertical(current, contentPool, 'up');
    }
  }

  const zone = topZone(current);
  const idx = ZONE_ORDER.indexOf(zone);
  if (idx < 0) return null;

  const step = key === 'ArrowDown' ? 1 : -1;
  for (let i = idx + step; i >= 0 && i < ZONE_ORDER.length; i += step) {
    const targetZone = ZONE_ORDER[i];
    const pool = all.filter((el) => topZone(el) === targetZone);
    if (pool.length === 0) continue;
    return nearestByVertical(current, pool, key === 'ArrowDown' ? 'down' : 'up') ?? pool[0];
  }

  return null;
}

function pickEdgeFallback(
  current: HTMLElement,
  all: HTMLElement[],
  key: string,
): HTMLElement | null {
  const sub = subZone(current);
  if (key === 'ArrowLeft' && sub === 'catalog') {
    const sidebarPool = all.filter((el) => subZone(el) === 'sidebar');
    return nearestByHorizontal(current, sidebarPool);
  }
  if (key === 'ArrowRight' && sub === 'sidebar') {
    const catalogPool = all.filter((el) => subZone(el) === 'catalog');
    return nearestByHorizontal(current, catalogPool);
  }
  return null;
}

function nearestByHorizontal(current: HTMLElement, pool: HTMLElement[]): HTMLElement | null {
  if (pool.length === 0) return null;
  const currentRect = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const candidate of pool) {
    const rect = candidate.getBoundingClientRect();
    const dx = Math.abs(
      rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2),
    );
    const dy = Math.abs(
      rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2),
    );
    const score = dy * 1000 + dx;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function nearestByVertical(
  current: HTMLElement,
  pool: HTMLElement[],
  direction: 'up' | 'down',
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const candidate of pool) {
    const rect = candidate.getBoundingClientRect();
    const dx = Math.abs(
      rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2),
    );
    const dy =
      direction === 'down'
        ? rect.top - currentRect.bottom
        : currentRect.top - rect.bottom;
    if (dy < -4) continue;
    const score = (direction === 'down' ? dy : dy) * 1000 + dx;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function topZone(el: HTMLElement): ZoneId {
  const node = el.closest('[data-focus-zone]');
  const zone = node?.getAttribute('data-focus-zone');
  if (zone === 'header' || zone === 'banner' || zone === 'tabs') {
    return zone;
  }
  return 'content';
}

function subZone(el: HTMLElement): string {
  const zone = el.closest('[data-focus-zone]')?.getAttribute('data-focus-zone');
  if (zone === 'sidebar' || zone === 'catalog' || zone === 'hub') {
    return zone;
  }
  if (el.closest('.category-sidebar')) return 'sidebar';
  if (el.closest('.content-panel')) return 'catalog';
  if (el.closest('.hub-scroll')) return 'hub';
  if (zone === 'content') return 'content';
  return topZone(el);
}

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null,
  );
}

function pickDefaultFocus(root: HTMLElement, all: HTMLElement[]): HTMLElement | null {
  const content = root.querySelector('[data-focus-zone="content"], [data-focus-zone="catalog"], [data-focus-zone="hub"], [data-focus-zone="sidebar"]');
  if (content) {
    const inContent = all.find((el) => content.contains(el));
    if (inContent) return inContent;
  }
  return all[0] ?? null;
}

export function focusFirst(root: HTMLElement): void {
  pickDefaultFocus(root, visibleFocusables(root))?.focus();
}
