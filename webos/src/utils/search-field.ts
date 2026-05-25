/** TV search: focusable button shows query; OK opens input + keyboard. */

import { dismissTvKeyboard } from './keyboard';

export function bindTvSearchFields(root: HTMLElement): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.search-field--tv')) {
    const inputId = btn.dataset.searchInput;
    if (!inputId) continue;
    const wrap = btn.closest('.search-field-wrap');
    const input = root.querySelector<HTMLInputElement>(`#${cssEscape(inputId)}`);
    if (!wrap || !input) continue;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchEditor(wrap, btn, input);
    });

    input.addEventListener('blur', () => {
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
): void {
  wrap.classList.add('search-field-wrap--editing');
  input.removeAttribute('readonly');
  input.setAttribute('tabindex', '0');
  input.focus();
  try {
    input.setSelectionRange(input.value.length, input.value.length);
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
