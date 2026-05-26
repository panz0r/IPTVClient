/** TV search: focusable button shows query; OK opens input + keyboard. */

import { dismissTvKeyboard } from './keyboard';

export type SearchEditorSnapshot = {
  inputId: string;
  cursorPos: number;
};

let ignoreSearchBlur = false;

export function runWithSearchBlurSuppressed(run: () => void): void {
  ignoreSearchBlur = true;
  try {
    run();
  } finally {
    ignoreSearchBlur = false;
  }
}

export function captureSearchEditorState(root: HTMLElement): SearchEditorSnapshot | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement)) return null;
  if (!el.classList.contains('search-field__input')) return null;
  if (!root.contains(el)) return null;
  const wrap = el.closest('.search-field-wrap');
  if (!wrap?.classList.contains('search-field-wrap--editing')) return null;
  return {
    inputId: el.id,
    cursorPos: el.selectionStart ?? el.value.length,
  };
}

export function reopenSearchEditor(root: HTMLElement, snapshot: SearchEditorSnapshot): void {
  const input = root.querySelector<HTMLInputElement>(`#${cssEscape(snapshot.inputId)}`);
  if (!input) return;

  for (const btn of root.querySelectorAll<HTMLButtonElement>('.search-field--tv')) {
    if (btn.dataset.searchInput !== snapshot.inputId) continue;
    const wrap = btn.closest('.search-field-wrap');
    if (!wrap) return;
    openSearchEditor(wrap, btn, input, snapshot.cursorPos);
    return;
  }
}

export function bindTvSearchFields(root: HTMLElement): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>(
    '.search-field--tv:not([data-tv-search-bound])',
  )) {
    const inputId = btn.dataset.searchInput;
    if (!inputId) continue;
    const wrap = btn.closest('.search-field-wrap');
    const input = root.querySelector<HTMLInputElement>(`#${cssEscape(inputId)}`);
    if (!wrap || !input) continue;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchEditor(wrap, btn, input);
    });

    btn.dataset.tvSearchBound = 'true';

    input.addEventListener('blur', () => {
      if (ignoreSearchBlur) return;
      closeSearchEditor(wrap, btn, input);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.keyCode === 461) {
        e.preventDefault();
        input.blur();
        btn.focus();
      }
    });

    syncSearchButtonLabel(btn, input);
  }
}

export function openSearchEditor(
  wrap: Element,
  btn: HTMLButtonElement,
  input: HTMLInputElement,
  cursorPos?: number,
): void {
  wrap.classList.add('search-field-wrap--editing');
  input.removeAttribute('readonly');
  input.setAttribute('tabindex', '0');
  input.focus();
  try {
    const pos = cursorPos ?? input.value.length;
    input.setSelectionRange(pos, pos);
  } catch {
    /* ignore */
  }
}

export function closeSearchEditor(
  wrap: Element,
  btn: HTMLButtonElement,
  input: HTMLInputElement,
): void {
  wrap.classList.remove('search-field-wrap--editing');
  input.setAttribute('readonly', 'true');
  input.setAttribute('tabindex', '-1');
  syncSearchButtonLabel(btn, input);
  dismissTvKeyboard();
}

function syncSearchButtonLabel(btn: HTMLButtonElement, input: HTMLInputElement): void {
  const textEl = btn.querySelector('.search-field__text');
  if (!textEl) return;
  const placeholder = input.placeholder || 'Search';
  const value = input.value.trim();
  textEl.textContent = value || placeholder;
  textEl.classList.toggle('search-field__text--placeholder', !value);
}

function cssEscape(id: string): string {
  if (typeof CSS !== 'undefined' && 'escape' in CSS) {
    return CSS.escape(id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
