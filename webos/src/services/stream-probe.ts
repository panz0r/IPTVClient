import { iptvFetch } from '../api/http';

export interface StreamProbeResult {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  log: string;
}

function isReachableStatus(code: number): boolean {
  return (
    code === 200 ||
    code === 206 ||
    code === 301 ||
    code === 302 ||
    code === 307 ||
    code === 308
  );
}

export async function probeStreamUrl(url: string): Promise<StreamProbeResult> {
  const log: string[] = [`--- Probe: ${url} ---`];

  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const init: RequestInit =
        method === 'GET' ? { method: 'GET', headers: { Range: 'bytes=0-4095' } } : { method: 'HEAD' };
      const started = Date.now();
      const response = await iptvFetch(url, init);
      const ms = Date.now() - started;
      log.push(`${method} ${response.status} (${ms}ms)`);
      const ct = response.headers.get('content-type');
      if (ct) log.push(`Content-Type: ${ct}`);

      if (isReachableStatus(response.status)) {
        return { url, reachable: true, statusCode: response.status, log: log.join('\n') };
      }
    } catch (e) {
      log.push(`${method} error: ${String(e)}`);
    }
  }

  return { url, reachable: false, statusCode: null, log: log.join('\n') };
}

/** Returns index of first reachable URL, or 0 if none respond. */
export async function probeBestStreamIndex(
  urls: string[],
  appendLog: (line: string) => void,
): Promise<number> {
  appendLog('Probing stream URLs…');
  for (let i = 0; i < urls.length; i++) {
    const result = await probeStreamUrl(urls[i]);
    appendLog(`[${i + 1}/${urls.length}] ${result.reachable ? 'OK' : 'FAIL'}`);
    appendLog(result.log);
    if (result.reachable) {
      if (i > 0) {
        appendLog(`Using candidate ${i + 1} (first reachable probe).`);
      }
      return i;
    }
  }
  appendLog('No probe succeeded; trying candidate 1 in player.');
  return 0;
}
