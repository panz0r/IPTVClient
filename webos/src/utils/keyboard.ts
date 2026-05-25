/** Dismiss LG webOS on-screen keyboard when leaving text fields. */
export function dismissTvKeyboard(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
  // webOS TV virtual keyboard
  const w = window as unknown as {
    PalmSystem?: { hideKeyboard?: () => void };
    webOS?: { platform?: { back?: () => void } };
  };
  try {
    w.PalmSystem?.hideKeyboard?.();
  } catch {
    /* ignore */
  }
}
