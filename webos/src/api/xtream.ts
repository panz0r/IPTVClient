import {
  accountSuccessSummary,
  isAccountUsable,
  parseAccountStatus,
  type AccountStatus,
} from './account-status';
import { formatJsonBody, iptvFetch, DEFAULT_HEADERS } from './http';
import { resolveLiveFormats } from './live-stream-format';
import { parseSubtitleHints, subtitleHintsToLanguages } from '../utils/subtitle-hints';
import { normalizeServerUrl } from './server-url-normalizer';

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface AuthAttemptResult {
  success: boolean;
  summary: string | null;
  debugLog: string;
  accountStatus: AccountStatus | null;
  allowedOutputFormats: string[] | null;
}

export interface Category {
  categoryId: string;
  categoryName: string;
}

export interface LiveStreamItem {
  streamId: number;
  name: string;
  streamIcon: string | null;
  directSource: string | null;
}

export interface VodItem {
  streamId: number;
  name: string;
  streamIcon: string | null;
  directSource: string | null;
  containerExtension: string | null;
  year: string | null;
  genre: string | null;
}

export interface SeriesItem {
  seriesId: number;
  name: string;
  cover: string | null;
  plot: string | null;
  genre: string | null;
  year: string | null;
}

export interface Episode {
  id: number;
  title: string;
  season: string;
  episodeNum: string | null;
  containerExtension: string | null;
  directSource: string | null;
  subtitles: string[];
}

export interface VodInfo {
  genre: string | null;
  plot: string | null;
  subtitles: string[];
}

export interface SeriesInfo {
  info: {
    plot: string | null;
    genre: string | null;
    cast: string | null;
    rating: string | null;
    backdropPath: string[];
  };
  episodes: Record<string, Episode[]>;
}

export interface ServerEndpoints {
  baseUrl: string;
  streamBase: string;
  movieBase: string;
  seriesBase: string;
}

export class XtreamApi {
  private readonly playerApiBase: string;
  private readonly endpoints: ServerEndpoints;
  private allowedOutputFormats: string[] | null = null;

  constructor(private readonly credentials: XtreamCredentials) {
    const base = normalizeServerUrl(credentials.serverUrl);
    const u = encodeURIComponent(credentials.username);
    const p = encodeURIComponent(credentials.password);
    this.playerApiBase = `${base}/player_api.php?username=${u}&password=${p}`;
    this.endpoints = resolveServerEndpoints(base, credentials);
  }

  getAllowedOutputFormats(): string[] | null {
    return this.allowedOutputFormats;
  }

  setAllowedOutputFormats(formats: string[] | null): void {
    this.allowedOutputFormats = formats;
  }

  private apiUrl(action: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      username: this.credentials.username,
      password: this.credentials.password,
      action,
      ...extra,
    });
    const base = normalizeServerUrl(this.credentials.serverUrl);
    return `${base}/player_api.php?${params}`;
  }

  async authenticateWithDebug(
    originalServerInput?: string,
  ): Promise<AuthAttemptResult> {
    const log: string[] = [];
    const uri = this.playerApiBase;

    log.push('=== IPTV Login Debug ===');
    log.push('WARNING: This log shows credentials in plain text.');
    log.push(`Timestamp: ${new Date().toISOString()}`);
    if (originalServerInput) {
      const normalized = normalizeServerUrl(originalServerInput);
      if (originalServerInput.trim() !== normalized) {
        log.push(`Server field (as entered): ${originalServerInput}`);
        log.push(`Server base URL used: ${normalized}`);
      }
    }
    log.push('Exact request URI:');
    log.push(uri);
    log.push('Method: GET');
    log.push('Request headers sent:');
    for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
      log.push(`  ${key}: ${value}`);
    }
    log.push('');

    try {
      const started = Date.now();
      const response = await iptvFetch(uri);
      const duration = Date.now() - started;

      log.push('--- Response ---');
      log.push(`HTTP status: ${response.status}`);
      log.push(`Duration: ${duration} ms`);
      const body = await response.text();
      log.push(`Body length: ${body.length} bytes`);
      log.push('');
      log.push('Response body:');
      log.push(formatJsonBody(body));
      log.push('');

      if (!response.ok) {
        log.push(`Result: FAILED (HTTP ${response.status})`);
        return {
          success: false,
          summary: summaryForStatus(response.status),
          debugLog: log.join('\n'),
          accountStatus: null,
          allowedOutputFormats: null,
        };
      }

      if (!body.trim()) {
        log.push('Result: FAILED (HTTP 200 but empty body)');
        return {
          success: false,
          summary:
            'Server returned HTTP 200 with an empty body. Check server URL and port.',
          debugLog: log.join('\n'),
          accountStatus: null,
          allowedOutputFormats: null,
        };
      }

      const check = evaluateAuthPayload(body, log);
      if (!check.success) {
        return {
          success: false,
          summary: check.summary,
          debugLog: log.join('\n'),
          accountStatus: check.accountStatus,
          allowedOutputFormats: null,
        };
      }

      this.allowedOutputFormats = check.allowedOutputFormats;
      log.push('Result: SUCCESS');
      return {
        success: true,
        summary: check.summary,
        debugLog: log.join('\n'),
        accountStatus: check.accountStatus,
        allowedOutputFormats: check.allowedOutputFormats,
      };
    } catch (error) {
      log.push('');
      log.push('--- Exception ---');
      log.push(String(error));
      log.push('Result: FAILED (request error)');
      return {
        success: false,
        summary: humanizeError(error),
        debugLog: log.join('\n'),
        accountStatus: null,
        allowedOutputFormats: null,
      };
    }
  }

  async getLiveCategories(): Promise<Category[]> {
    return this.fetchCategories('get_live_categories');
  }

  async getLiveStreams(categoryId?: string): Promise<LiveStreamItem[]> {
    const extra = categoryId ? { category_id: categoryId } : {};
    const data = await this.fetchJson('get_live_streams', extra);
    return (Array.isArray(data) ? data : []).map(parseLiveStream);
  }

  async getVodCategories(): Promise<Category[]> {
    return this.fetchCategories('get_vod_categories');
  }

  async getVodStreams(categoryId?: string): Promise<VodItem[]> {
    const extra = categoryId ? { category_id: categoryId } : {};
    const data = await this.fetchJson('get_vod_streams', extra);
    return (Array.isArray(data) ? data : []).map(parseVodItem);
  }

  async getVodInfo(streamId: number): Promise<VodInfo> {
    const data = (await this.fetchJson('get_vod_info', {
      vod_id: String(streamId),
    })) as Record<string, unknown>;
    const infoRaw = (data.info as Record<string, unknown>) ?? {};
    return {
      genre: strOrNull(infoRaw.genre),
      plot: strOrNull(infoRaw.plot),
      subtitles: subtitleHintsToLanguages(parseSubtitleHints(infoRaw.subtitles)),
    };
  }

  async getSeriesCategories(): Promise<Category[]> {
    return this.fetchCategories('get_series_categories');
  }

  async getSeries(categoryId?: string): Promise<SeriesItem[]> {
    const extra = categoryId ? { category_id: categoryId } : {};
    const data = await this.fetchJson('get_series', extra);
    return (Array.isArray(data) ? data : []).map(parseSeriesItem);
  }

  async getSeriesInfo(seriesId: number): Promise<SeriesInfo> {
    const data = (await this.fetchJson('get_series_info', {
      series_id: String(seriesId),
    })) as Record<string, unknown>;

    const infoRaw = (data.info as Record<string, unknown>) ?? {};
    const episodesRaw = (data.episodes as Record<string, unknown[]>) ?? {};

    const episodes: Record<string, Episode[]> = {};
    for (const [season, list] of Object.entries(episodesRaw)) {
      episodes[season] = (Array.isArray(list) ? list : []).map(parseEpisode);
    }

    const backdrop =
      infoRaw.backdrop_path ?? infoRaw.backdropPath ?? infoRaw.cover;
    const backdropPath = Array.isArray(backdrop)
      ? backdrop.map(String)
      : backdrop
        ? [String(backdrop)]
        : [];

    return {
      info: {
        plot: strOrNull(infoRaw.plot),
        genre: strOrNull(infoRaw.genre),
        cast: strOrNull(infoRaw.cast),
        rating: strOrNull(infoRaw.rating),
        backdropPath,
      },
      episodes,
    };
  }

  buildLiveStreamUrlCandidates(item: LiveStreamItem): string[] {
    if (item.directSource) {
      return [item.directSource];
    }
    const formats = resolveLiveFormats(this.allowedOutputFormats);
    return formats.map((format) =>
      `${this.endpoints.streamBase}/${item.streamId}.${format}`,
    );
  }

  buildVodUrl(item: VodItem): string {
    if (item.directSource) {
      return item.directSource;
    }
    const ext = item.containerExtension ?? 'mp4';
    return `${this.endpoints.movieBase}/${item.streamId}.${ext}`;
  }

  buildEpisodeUrl(episode: Episode): string {
    if (episode.directSource) {
      return episode.directSource;
    }
    const ext = episode.containerExtension ?? 'mp4';
    return `${this.endpoints.seriesBase}/${episode.id}.${ext}`;
  }

  private async fetchCategories(action: string): Promise<Category[]> {
    const data = await this.fetchJson(action);
    return (Array.isArray(data) ? data : []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        categoryId: String(r.category_id ?? r.categoryId ?? ''),
        categoryName: String(r.category_name ?? r.categoryName ?? 'Unknown'),
      };
    });
  }

  private async fetchJson(
    action: string,
    extra: Record<string, string> = {},
  ): Promise<unknown> {
    const url = this.apiUrl(action, extra);
    const response = await iptvFetch(url);
    if (!response.ok) {
      throw new Error(`API ${action} failed: HTTP ${response.status}`);
    }
    return response.json();
  }
}

function resolveServerEndpoints(
  base: string,
  creds: XtreamCredentials,
): ServerEndpoints {
  const u = creds.username;
  const p = creds.password;
  return {
    baseUrl: base,
    streamBase: `${base}/live/${u}/${p}`,
    movieBase: `${base}/movie/${u}/${p}`,
    seriesBase: `${base}/series/${u}/${p}`,
  };
}

function parseLiveStream(row: unknown): LiveStreamItem {
  const r = row as Record<string, unknown>;
  return {
    streamId: intOrZero(r.stream_id ?? r.num),
    name: String(r.name ?? 'Unknown channel'),
    streamIcon: strOrNull(r.stream_icon),
    directSource: strOrNull(r.direct_source),
  };
}

function parseVodItem(row: unknown): VodItem {
  const r = row as Record<string, unknown>;
  return {
    streamId: intOrZero(r.stream_id ?? r.num),
    name: String(r.name ?? r.title ?? 'Movie'),
    streamIcon: strOrNull(r.stream_icon),
    directSource: strOrNull(r.direct_source),
    containerExtension: strOrNull(r.container_extension),
    year: strOrNull(r.year),
    genre: strOrNull(r.genre),
  };
}

function parseSeriesItem(row: unknown): SeriesItem {
  const r = row as Record<string, unknown>;
  return {
    seriesId: intOrZero(r.series_id ?? r.num),
    name: String(r.name ?? r.title ?? 'Series'),
    cover: strOrNull(r.cover),
    plot: strOrNull(r.plot),
    genre: strOrNull(r.genre),
    year: strOrNull(r.year),
  };
}

function parseEpisode(row: unknown): Episode {
  const r = row as Record<string, unknown>;
  return {
    id: intOrZero(r.id),
    title: String(r.title ?? r.name ?? 'Episode'),
    season: String(r.season ?? ''),
    episodeNum: strOrNull(r.episode_num),
    containerExtension: strOrNull(r.container_extension),
    directSource: strOrNull(r.direct_source),
    subtitles: subtitleHintsToLanguages(parseSubtitleHints(r.subtitles)),
  };
}

function evaluateAuthPayload(
  body: string,
  log: string[],
): {
  success: boolean;
  summary: string | null;
  accountStatus: AccountStatus | null;
  allowedOutputFormats: string[] | null;
} {
  log.push('--- Parsed auth ---');
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch (error) {
    log.push(`JSON parse failed: ${error}`);
    return {
      success: false,
      summary: 'Server returned a response that is not valid JSON.',
      accountStatus: null,
      allowedOutputFormats: null,
    };
  }

  if (!decoded || typeof decoded !== 'object') {
    return {
      success: false,
      summary: 'Server returned an unexpected JSON payload.',
      accountStatus: null,
      allowedOutputFormats: null,
    };
  }

  const root = decoded as Record<string, unknown>;
  const userInfo = root.user_info;
  if (!userInfo || typeof userInfo !== 'object') {
    return {
      success: false,
      summary: 'Server response did not include user_info.',
      accountStatus: null,
      allowedOutputFormats: null,
    };
  }

  const info = userInfo as Record<string, unknown>;
  const account = parseAccountStatus(info);

  if (!isAccountUsable(account)) {
    return {
      success: false,
      summary: `${account.title}: ${account.message}`,
      accountStatus: account,
      allowedOutputFormats: null,
    };
  }

  const username = info.username != null ? String(info.username) : null;
  const extra = accountSuccessSummary(account);
  let summary = 'Authentication successful';
  if (username) {
    summary = extra ? `Signed in as ${username} · ${extra}` : `Signed in as ${username}`;
  } else if (extra) {
    summary = extra;
  }

  const allowed = readAllowedOutputFormats(info);
  if (allowed) {
    log.push(
      `Live formats (resolved): ${resolveLiveFormats(allowed).join(', ')}`,
    );
  }

  return {
    success: true,
    summary,
    accountStatus: account,
    allowedOutputFormats: allowed,
  };
}

function readAllowedOutputFormats(
  info: Record<string, unknown>,
): string[] | null {
  const raw = info.allowed_output_formats;
  if (!Array.isArray(raw)) return null;
  const formats = raw
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter((v) => v.length > 0);
  return formats.length > 0 ? formats : null;
}

function summaryForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Unauthorized (401) — wrong username or password.';
    case 403:
      return 'Forbidden (403) — server or Cloudflare blocked the request.';
    case 404:
      return 'Not found (404) — check server URL and port.';
    default:
      return `Server returned HTTP ${status}. See connection log.`;
  }
}

function humanizeError(error: unknown): string {
  const message = String(error);
  if (message.includes('abort')) {
    return 'The server did not respond in time.';
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Could not reach the server. Check the URL and your connection.';
  }
  return 'Connection failed. See the connection log for details.';
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function intOrZero(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = parseInt(String(value ?? '0'), 10);
  return Number.isNaN(n) ? 0 : n;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter((v) => v.length > 0);
}
