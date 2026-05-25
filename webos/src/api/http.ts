/** Browser-like headers for IPTV panels behind Cloudflare. */
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Encoding': 'gzip',
  Connection: 'keep-alive',
};

export async function iptvFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function formatJsonBody(body: string): string {
  if (!body.trim()) {
    return '(empty body)';
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
