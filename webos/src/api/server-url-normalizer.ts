const API_PATH_SUFFIXES = [
  'player_api.php',
  'panel_api.php',
  'get.php',
  'xmltv.php',
];

export function normalizeServerUrl(raw: string): string {
  let input = raw.trim();
  if (!input) {
    throw new Error('Server URL cannot be empty.');
  }

  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    input = `http://${input}`;
  }

  const uri = new URL(input);
  if (!uri.hostname) {
    throw new Error('Server URL must include a hostname.');
  }

  const segments = uri.pathname.split('/').filter((s) => s.length > 0);
  while (
    segments.length > 0 &&
    API_PATH_SUFFIXES.includes(segments[segments.length - 1].toLowerCase())
  ) {
    segments.pop();
  }

  let normalized = `${uri.protocol}//${uri.hostname}`;
  if (uri.port) {
    normalized += `:${uri.port}`;
  }
  if (segments.length > 0) {
    normalized += `/${segments.join('/')}`;
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function extractEmbeddedCredentials(raw: string): {
  username: string | null;
  password: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed.includes('?')) {
    return { username: null, password: null };
  }
  try {
    const uri = new URL(
      trimmed.startsWith('http') ? trimmed : `http://${trimmed}`,
    );
    return {
      username: uri.searchParams.get('username'),
      password: uri.searchParams.get('password'),
    };
  } catch {
    return { username: null, password: null };
  }
}
