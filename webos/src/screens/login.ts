import { extractEmbeddedCredentials, normalizeServerUrl } from '../api/server-url-normalizer';
import { appState } from '../state/app-state';
import { dismissTvKeyboard } from '../utils/keyboard';

const APP_NAME = 'Peders fantastiska IPTV spelare';
const ICON_TV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`;

export function renderLogin(root: HTMLElement): void {
  dismissTvKeyboard();
  const creds = {
    server: localStorage.getItem('login_draft_server') ?? '',
    user: localStorage.getItem('login_draft_user') ?? '',
    pass: localStorage.getItem('login_draft_pass') ?? '',
  };

  root.innerHTML = '';

  const screen = div('screen login-screen');
  const left = div('login-screen__left');
  const card = div('login-card');

  const iconWrap = div('login-card__icon');
  iconWrap.innerHTML = ICON_TV;

  const title = document.createElement('h1');
  title.className = 'login-card__title';
  title.textContent = APP_NAME;

  const subtitle = document.createElement('p');
  subtitle.className = 'login-card__subtitle';
  subtitle.textContent = 'Connect with your Xtream Codes credentials';

  const form = document.createElement('form');
  form.className = 'login-form';
  form.id = 'login-form';

  form.append(
    field('Server URL', 'server', creds.server, 'http://host:8080 (no /player_api.php)'),
    field('Username', 'username', creds.user),
    field('Password', 'password', creds.pass, undefined, true),
  );

  if (appState.loginError) {
    const err = document.createElement('p');
    err.className = 'error-banner';
    err.textContent = appState.loginError;
    form.append(err);
  }

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn filled focusable';
  submit.tabIndex = 0;
  submit.disabled = appState.isLoggingIn;
  submit.textContent = appState.isLoggingIn ? 'Connecting…' : 'Connect';
  form.append(submit);

  card.append(iconWrap, title, subtitle, form);
  left.append(card);

  const right = document.createElement('aside');
  right.className = 'login-screen__right';
  const panel = div('debug-panel');
  const panelHeader = div('debug-panel__header');
  const panelTitle = document.createElement('h2');
  panelTitle.textContent = 'Connection log';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn focusable';
  clearBtn.id = 'clear-log';
  clearBtn.tabIndex = 0;
  clearBtn.textContent = 'Clear';
  panelHeader.append(panelTitle, clearBtn);
  const logBody = document.createElement('pre');
  logBody.className = 'debug-panel__body';
  logBody.textContent = appState.loginDebugLog || 'Log appears after connect attempt.';
  panel.append(panelHeader, logBody);
  right.append(panel);

  screen.append(left, right);
  root.append(screen);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    let server = String(fd.get('server') ?? '').trim();
    const username = String(fd.get('username') ?? '').trim();
    const password = String(fd.get('password') ?? '');

    const embedded = extractEmbeddedCredentials(server);
    const finalUser = username || embedded.username || '';
    const finalPass = password || embedded.password || '';

    localStorage.setItem('login_draft_server', server);
    localStorage.setItem('login_draft_user', finalUser);
    localStorage.setItem('login_draft_pass', finalPass);

    try {
      server = normalizeServerUrl(server);
    } catch (err) {
      appState.loginError = String(err);
      appState.notify();
      return;
    }

    await appState.login(
      { serverUrl: server, username: finalUser, password: finalPass },
      String(fd.get('server') ?? '').trim(),
    );
  });

  clearBtn.addEventListener('click', () => {
    appState.loginDebugLog = '';
    appState.notify();
  });

  submit.focus();
}

function div(className: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  return node;
}

function field(
  label: string,
  name: string,
  value: string,
  placeholder?: string,
  password = false,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = password ? 'password' : 'text';
  input.name = name;
  input.className = 'focusable';
  input.tabIndex = 0;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  wrap.append(span, input);
  return wrap;
}
