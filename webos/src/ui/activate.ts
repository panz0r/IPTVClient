/** Wire remote OK / Enter and click for TV-focusable tiles and buttons. */
export function bindActivate(el: HTMLElement | null | undefined, handler: () => void): void {
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    handler();
  });
  el.addEventListener('keydown', (e) => {
    const code = e.keyCode;
    if (code === 13 || code === 28 || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handler();
    }
  });
}
