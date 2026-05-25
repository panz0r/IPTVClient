import { appState } from './state/app-state';
import { renderLogin } from './screens/login';
import { renderHome, renderHubBrowse, renderSeriesDetail } from './screens/home';
import { renderPlayer } from './screens/player';
import { initFocusRoot } from './ui/focus';
import { dismissTvKeyboard } from './utils/keyboard';

let root: HTMLElement;
let renderScheduled = false;

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (root) {
    root.innerHTML = `<pre class="fatal-error">${escapeHtml(message)}</pre>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(): void {
  try {
    const screen = appState.screen;
    if (screen.name === 'login') {
      renderLogin(root);
    } else if (screen.name === 'home') {
      renderHome(root);
    } else if (screen.name === 'hub-browse') {
      renderHubBrowse(root);
    } else if (screen.name === 'series-detail') {
      renderSeriesDetail(root);
    } else if (screen.name === 'player') {
      dismissTvKeyboard();
      renderPlayer(root, screen.request);
    }
  } catch (error) {
    showFatalError(error);
  }
}

function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function bootstrap(): void {
  const el = document.getElementById('app');
  if (!el) {
    document.body.innerHTML =
      '<pre class="fatal-error">Missing #app root element.</pre>';
    return;
  }
  root = el;
  initFocusRoot(document.body);

  appState.subscribe(scheduleRender);

  document.addEventListener('keydown', (event) => {
    const isBack =
      event.keyCode === 461 ||
      event.key === 'Backspace' ||
      event.key === 'Escape' ||
      event.key === 'GoBack';
    if (isBack && appState.handleBack()) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('popstate', () => {
    appState.handleBack();
  });

  if (typeof webOS !== 'undefined') {
    document.addEventListener(
      'webOSRelaunch',
      () => {
        void appState.tryAutoLogin();
      },
      false,
    );
  }

  void appState.tryAutoLogin();
  scheduleRender();

  (window as unknown as { iptvApp: typeof appState }).iptvApp = appState;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

window.addEventListener('error', (event) => {
  showFatalError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason);
});
