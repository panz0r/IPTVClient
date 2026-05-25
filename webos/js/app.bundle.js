"use strict";
(() => {
  // src/api/account-status.ts
  function accountSuccessSummary(status) {
    if (!isAccountUsable(status)) {
      return null;
    }
    const parts = [];
    if (status.expiresAt) {
      parts.push(`expires ${formatDate(status.expiresAt)}`);
    }
    if (status.isTrial === true) {
      parts.push("trial");
    }
    return parts.length > 0 ? parts.join(" \xB7 ") : null;
  }
  function isAccountUsable(status) {
    return status.kind === "active";
  }
  function readAuth(value) {
    return value === 1 || value === "1" || value === true || value === "true";
  }
  function readBool(value) {
    if (value == null) return null;
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
    return null;
  }
  function readInt(value) {
    if (value == null) return null;
    if (typeof value === "number") return value;
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? null : n;
  }
  function readExpDate(value) {
    if (value == null) return null;
    const seconds = typeof value === "number" ? value : parseInt(String(value), 10);
    if (!seconds || seconds <= 0) return null;
    return new Date(seconds * 1e3);
  }
  function formatDate(date) {
    const local = new Date(date);
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, "0");
    const d = String(local.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function composeMessage(fallback, serverMessage, rawStatus) {
    if (serverMessage) return serverMessage;
    if (rawStatus) return `${fallback} (status: ${rawStatus})`;
    return fallback;
  }
  function parseAccountStatus(info) {
    const auth = readAuth(info.auth);
    const rawStatus = info.status != null ? String(info.status).trim() : null;
    const serverMessage = info.message != null ? String(info.message).trim() : null;
    const expiresAt = readExpDate(info.exp_date);
    const isTrial = readBool(info.is_trial);
    const maxConnections = readInt(info.max_connections);
    const activeConnections = readInt(info.active_cons);
    const statusLower = (rawStatus != null ? rawStatus : "").toLowerCase();
    const base = {
      expiresAt,
      isTrial,
      maxConnections,
      activeConnections,
      rawStatus,
      serverMessage
    };
    if (!auth) {
      const kind = kindForStatus(statusLower, serverMessage);
      if (kind === "expired") {
        return expiredStatus(base);
      }
      if (kind === "banned") {
        return bannedStatus(base);
      }
      if (kind === "disabled") {
        return disabledStatus(base);
      }
      return {
        kind: "invalidCredentials",
        title: "Login rejected",
        message: composeMessage(
          "The server rejected these credentials (auth = 0).",
          serverMessage,
          rawStatus
        ),
        ...base
      };
    }
    if (statusIndicatesExpired(statusLower)) {
      return expiredStatus(base);
    }
    if (statusIndicatesBanned(statusLower)) {
      return bannedStatus(base);
    }
    if (statusIndicatesDisabled(statusLower)) {
      return disabledStatus(base);
    }
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return expiredStatus(base);
    }
    if (maxConnections != null && activeConnections != null && activeConnections >= maxConnections) {
      return {
        kind: "maxConnectionsReached",
        title: "Connection limit reached",
        message: `This account is already using ${activeConnections} of ${maxConnections} allowed connections.`,
        ...base
      };
    }
    return {
      kind: "active",
      title: "Active",
      message: "Account is active.",
      ...base
    };
  }
  function kindForStatus(statusLower, serverMessage) {
    const combined = `${statusLower}_${(serverMessage != null ? serverMessage : "").toLowerCase()}`;
    if (statusIndicatesExpired(statusLower) || combined.includes("expired") || combined.includes("expir")) {
      return "expired";
    }
    if (statusIndicatesBanned(statusLower) || combined.includes("ban")) {
      return "banned";
    }
    if (statusIndicatesDisabled(statusLower)) {
      return "disabled";
    }
    return "invalidCredentials";
  }
  function statusIndicatesExpired(s) {
    return s.includes("expired") || s === "exp" || s.includes("subscription ended");
  }
  function statusIndicatesBanned(s) {
    return s.includes("ban");
  }
  function statusIndicatesDisabled(s) {
    return s.includes("disabled") || s.includes("suspend") || s.includes("inactive");
  }
  function expiredStatus(base) {
    const expiryText = base.expiresAt ? ` Subscription ended ${formatDate(base.expiresAt)}.` : "";
    return {
      kind: "expired",
      title: "Subscription expired",
      message: composeMessage(
        `Your IPTV subscription has expired.${expiryText}`,
        base.serverMessage,
        base.rawStatus
      ),
      ...base
    };
  }
  function bannedStatus(base) {
    return {
      kind: "banned",
      title: "Account banned",
      message: composeMessage(
        "This account has been banned by the provider.",
        base.serverMessage,
        base.rawStatus
      ),
      ...base
    };
  }
  function disabledStatus(base) {
    return {
      kind: "disabled",
      title: "Account disabled",
      message: composeMessage(
        "This account is disabled or suspended.",
        base.serverMessage,
        base.rawStatus
      ),
      ...base
    };
  }

  // src/api/http.ts
  var DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip",
    Connection: "keep-alive"
  };
  async function iptvFetch(url, init = {}) {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      return await fetch(url, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
  function formatJsonBody(body) {
    if (!body.trim()) {
      return "(empty body)";
    }
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }

  // src/api/live-stream-format.ts
  var DEFAULT_FORMATS = ["ts", "m3u8"];
  var PREFERRED_ORDER = ["ts", "m3u8", "mkv", "mp4", "rtmp"];
  function resolveLiveFormats(allowedOutputFormats) {
    if (!allowedOutputFormats || allowedOutputFormats.length === 0) {
      return [...DEFAULT_FORMATS];
    }
    const normalized = new Set(
      allowedOutputFormats.map((f) => f.trim().toLowerCase()).filter((f) => f.length > 0)
    );
    if (normalized.size === 0) {
      return [...DEFAULT_FORMATS];
    }
    const ordered = [];
    for (const format of PREFERRED_ORDER) {
      if (normalized.has(format)) {
        ordered.push(format);
      }
    }
    for (const format of normalized) {
      if (!ordered.includes(format)) {
        ordered.push(format);
      }
    }
    return ordered;
  }

  // src/api/server-url-normalizer.ts
  var API_PATH_SUFFIXES = [
    "player_api.php",
    "panel_api.php",
    "get.php",
    "xmltv.php"
  ];
  function normalizeServerUrl(raw) {
    let input = raw.trim();
    if (!input) {
      throw new Error("Server URL cannot be empty.");
    }
    if (!input.startsWith("http://") && !input.startsWith("https://")) {
      input = `http://${input}`;
    }
    const uri = new URL(input);
    if (!uri.hostname) {
      throw new Error("Server URL must include a hostname.");
    }
    const segments = uri.pathname.split("/").filter((s) => s.length > 0);
    while (segments.length > 0 && API_PATH_SUFFIXES.includes(segments[segments.length - 1].toLowerCase())) {
      segments.pop();
    }
    let normalized = `${uri.protocol}//${uri.hostname}`;
    if (uri.port) {
      normalized += `:${uri.port}`;
    }
    if (segments.length > 0) {
      normalized += `/${segments.join("/")}`;
    }
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
  function extractEmbeddedCredentials(raw) {
    const trimmed = raw.trim();
    if (!trimmed.includes("?")) {
      return { username: null, password: null };
    }
    try {
      const uri = new URL(
        trimmed.startsWith("http") ? trimmed : `http://${trimmed}`
      );
      return {
        username: uri.searchParams.get("username"),
        password: uri.searchParams.get("password")
      };
    } catch {
      return { username: null, password: null };
    }
  }

  // src/api/xtream.ts
  var XtreamApi = class {
    constructor(credentials) {
      this.credentials = credentials;
      this.allowedOutputFormats = null;
      const base = normalizeServerUrl(credentials.serverUrl);
      const u = encodeURIComponent(credentials.username);
      const p = encodeURIComponent(credentials.password);
      this.playerApiBase = `${base}/player_api.php?username=${u}&password=${p}`;
      this.endpoints = resolveServerEndpoints(base, credentials);
    }
    getAllowedOutputFormats() {
      return this.allowedOutputFormats;
    }
    setAllowedOutputFormats(formats) {
      this.allowedOutputFormats = formats;
    }
    apiUrl(action, extra = {}) {
      const params = new URLSearchParams({
        username: this.credentials.username,
        password: this.credentials.password,
        action,
        ...extra
      });
      const base = normalizeServerUrl(this.credentials.serverUrl);
      return `${base}/player_api.php?${params}`;
    }
    async authenticateWithDebug(originalServerInput) {
      const log = [];
      const uri = this.playerApiBase;
      log.push("=== IPTV Login Debug ===");
      log.push("WARNING: This log shows credentials in plain text.");
      log.push(`Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}`);
      if (originalServerInput) {
        const normalized = normalizeServerUrl(originalServerInput);
        if (originalServerInput.trim() !== normalized) {
          log.push(`Server field (as entered): ${originalServerInput}`);
          log.push(`Server base URL used: ${normalized}`);
        }
      }
      log.push("Exact request URI:");
      log.push(uri);
      log.push("Method: GET");
      log.push("Request headers sent:");
      for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
        log.push(`  ${key}: ${value}`);
      }
      log.push("");
      try {
        const started = Date.now();
        const response = await iptvFetch(uri);
        const duration = Date.now() - started;
        log.push("--- Response ---");
        log.push(`HTTP status: ${response.status}`);
        log.push(`Duration: ${duration} ms`);
        const body = await response.text();
        log.push(`Body length: ${body.length} bytes`);
        log.push("");
        log.push("Response body:");
        log.push(formatJsonBody(body));
        log.push("");
        if (!response.ok) {
          log.push(`Result: FAILED (HTTP ${response.status})`);
          return {
            success: false,
            summary: summaryForStatus(response.status),
            debugLog: log.join("\n"),
            accountStatus: null,
            allowedOutputFormats: null
          };
        }
        if (!body.trim()) {
          log.push("Result: FAILED (HTTP 200 but empty body)");
          return {
            success: false,
            summary: "Server returned HTTP 200 with an empty body. Check server URL and port.",
            debugLog: log.join("\n"),
            accountStatus: null,
            allowedOutputFormats: null
          };
        }
        const check = evaluateAuthPayload(body, log);
        if (!check.success) {
          return {
            success: false,
            summary: check.summary,
            debugLog: log.join("\n"),
            accountStatus: check.accountStatus,
            allowedOutputFormats: null
          };
        }
        this.allowedOutputFormats = check.allowedOutputFormats;
        log.push("Result: SUCCESS");
        return {
          success: true,
          summary: check.summary,
          debugLog: log.join("\n"),
          accountStatus: check.accountStatus,
          allowedOutputFormats: check.allowedOutputFormats
        };
      } catch (error) {
        log.push("");
        log.push("--- Exception ---");
        log.push(String(error));
        log.push("Result: FAILED (request error)");
        return {
          success: false,
          summary: humanizeError(error),
          debugLog: log.join("\n"),
          accountStatus: null,
          allowedOutputFormats: null
        };
      }
    }
    async getLiveCategories() {
      return this.fetchCategories("get_live_categories");
    }
    async getLiveStreams(categoryId) {
      const extra = categoryId ? { category_id: categoryId } : {};
      const data = await this.fetchJson("get_live_streams", extra);
      return (Array.isArray(data) ? data : []).map(parseLiveStream);
    }
    async getVodCategories() {
      return this.fetchCategories("get_vod_categories");
    }
    async getVodStreams(categoryId) {
      const extra = categoryId ? { category_id: categoryId } : {};
      const data = await this.fetchJson("get_vod_streams", extra);
      return (Array.isArray(data) ? data : []).map(parseVodItem);
    }
    async getVodInfo(streamId) {
      var _a;
      const data = await this.fetchJson("get_vod_info", {
        vod_id: String(streamId)
      });
      const infoRaw = (_a = data.info) != null ? _a : {};
      return {
        genre: strOrNull(infoRaw.genre),
        plot: strOrNull(infoRaw.plot)
      };
    }
    async getSeriesCategories() {
      return this.fetchCategories("get_series_categories");
    }
    async getSeries(categoryId) {
      const extra = categoryId ? { category_id: categoryId } : {};
      const data = await this.fetchJson("get_series", extra);
      return (Array.isArray(data) ? data : []).map(parseSeriesItem);
    }
    async getSeriesInfo(seriesId) {
      var _a, _b, _c, _d;
      const data = await this.fetchJson("get_series_info", {
        series_id: String(seriesId)
      });
      const infoRaw = (_a = data.info) != null ? _a : {};
      const episodesRaw = (_b = data.episodes) != null ? _b : {};
      const episodes = {};
      for (const [season, list] of Object.entries(episodesRaw)) {
        episodes[season] = (Array.isArray(list) ? list : []).map(parseEpisode);
      }
      const backdrop = (_d = (_c = infoRaw.backdrop_path) != null ? _c : infoRaw.backdropPath) != null ? _d : infoRaw.cover;
      const backdropPath = Array.isArray(backdrop) ? backdrop.map(String) : backdrop ? [String(backdrop)] : [];
      return {
        info: {
          plot: strOrNull(infoRaw.plot),
          genre: strOrNull(infoRaw.genre),
          cast: strOrNull(infoRaw.cast),
          rating: strOrNull(infoRaw.rating),
          backdropPath
        },
        episodes
      };
    }
    buildLiveStreamUrlCandidates(item) {
      if (item.directSource) {
        return [item.directSource];
      }
      const formats = resolveLiveFormats(this.allowedOutputFormats);
      return formats.map(
        (format) => `${this.endpoints.streamBase}/${item.streamId}.${format}`
      );
    }
    buildVodUrl(item) {
      var _a;
      if (item.directSource) {
        return item.directSource;
      }
      const ext = (_a = item.containerExtension) != null ? _a : "mp4";
      return `${this.endpoints.movieBase}/${item.streamId}.${ext}`;
    }
    buildEpisodeUrl(episode) {
      var _a;
      if (episode.directSource) {
        return episode.directSource;
      }
      const ext = (_a = episode.containerExtension) != null ? _a : "mp4";
      return `${this.endpoints.seriesBase}/${episode.id}.${ext}`;
    }
    async fetchCategories(action) {
      const data = await this.fetchJson(action);
      return (Array.isArray(data) ? data : []).map((row) => {
        var _a, _b, _c, _d;
        const r = row;
        return {
          categoryId: String((_b = (_a = r.category_id) != null ? _a : r.categoryId) != null ? _b : ""),
          categoryName: String((_d = (_c = r.category_name) != null ? _c : r.categoryName) != null ? _d : "Unknown")
        };
      });
    }
    async fetchJson(action, extra = {}) {
      const url = this.apiUrl(action, extra);
      const response = await iptvFetch(url);
      if (!response.ok) {
        throw new Error(`API ${action} failed: HTTP ${response.status}`);
      }
      return response.json();
    }
  };
  function resolveServerEndpoints(base, creds) {
    const u = creds.username;
    const p = creds.password;
    return {
      baseUrl: base,
      streamBase: `${base}/live/${u}/${p}`,
      movieBase: `${base}/movie/${u}/${p}`,
      seriesBase: `${base}/series/${u}/${p}`
    };
  }
  function parseLiveStream(row) {
    var _a, _b;
    const r = row;
    return {
      streamId: intOrZero((_a = r.stream_id) != null ? _a : r.num),
      name: String((_b = r.name) != null ? _b : "Unknown channel"),
      streamIcon: strOrNull(r.stream_icon),
      directSource: strOrNull(r.direct_source)
    };
  }
  function parseVodItem(row) {
    var _a, _b, _c;
    const r = row;
    return {
      streamId: intOrZero((_a = r.stream_id) != null ? _a : r.num),
      name: String((_c = (_b = r.name) != null ? _b : r.title) != null ? _c : "Movie"),
      streamIcon: strOrNull(r.stream_icon),
      directSource: strOrNull(r.direct_source),
      containerExtension: strOrNull(r.container_extension),
      year: strOrNull(r.year),
      genre: strOrNull(r.genre)
    };
  }
  function parseSeriesItem(row) {
    var _a, _b, _c;
    const r = row;
    return {
      seriesId: intOrZero((_a = r.series_id) != null ? _a : r.num),
      name: String((_c = (_b = r.name) != null ? _b : r.title) != null ? _c : "Series"),
      cover: strOrNull(r.cover),
      plot: strOrNull(r.plot),
      genre: strOrNull(r.genre),
      year: strOrNull(r.year)
    };
  }
  function parseEpisode(row) {
    var _a, _b, _c;
    const r = row;
    return {
      id: intOrZero(r.id),
      title: String((_b = (_a = r.title) != null ? _a : r.name) != null ? _b : "Episode"),
      season: String((_c = r.season) != null ? _c : ""),
      episodeNum: strOrNull(r.episode_num),
      containerExtension: strOrNull(r.container_extension),
      directSource: strOrNull(r.direct_source)
    };
  }
  function evaluateAuthPayload(body, log) {
    log.push("--- Parsed auth ---");
    let decoded;
    try {
      decoded = JSON.parse(body);
    } catch (error) {
      log.push(`JSON parse failed: ${error}`);
      return {
        success: false,
        summary: "Server returned a response that is not valid JSON.",
        accountStatus: null,
        allowedOutputFormats: null
      };
    }
    if (!decoded || typeof decoded !== "object") {
      return {
        success: false,
        summary: "Server returned an unexpected JSON payload.",
        accountStatus: null,
        allowedOutputFormats: null
      };
    }
    const root2 = decoded;
    const userInfo = root2.user_info;
    if (!userInfo || typeof userInfo !== "object") {
      return {
        success: false,
        summary: "Server response did not include user_info.",
        accountStatus: null,
        allowedOutputFormats: null
      };
    }
    const info = userInfo;
    const account = parseAccountStatus(info);
    if (!isAccountUsable(account)) {
      return {
        success: false,
        summary: `${account.title}: ${account.message}`,
        accountStatus: account,
        allowedOutputFormats: null
      };
    }
    const username = info.username != null ? String(info.username) : null;
    const extra = accountSuccessSummary(account);
    let summary = "Authentication successful";
    if (username) {
      summary = extra ? `Signed in as ${username} \xB7 ${extra}` : `Signed in as ${username}`;
    } else if (extra) {
      summary = extra;
    }
    const allowed = readAllowedOutputFormats(info);
    if (allowed) {
      log.push(
        `Live formats (resolved): ${resolveLiveFormats(allowed).join(", ")}`
      );
    }
    return {
      success: true,
      summary,
      accountStatus: account,
      allowedOutputFormats: allowed
    };
  }
  function readAllowedOutputFormats(info) {
    const raw = info.allowed_output_formats;
    if (!Array.isArray(raw)) return null;
    const formats = raw.map((v) => v != null ? String(v).trim() : "").filter((v) => v.length > 0);
    return formats.length > 0 ? formats : null;
  }
  function summaryForStatus(status) {
    switch (status) {
      case 401:
        return "Unauthorized (401) \u2014 wrong username or password.";
      case 403:
        return "Forbidden (403) \u2014 server or Cloudflare blocked the request.";
      case 404:
        return "Not found (404) \u2014 check server URL and port.";
      default:
        return `Server returned HTTP ${status}. See connection log.`;
    }
  }
  function humanizeError(error) {
    const message = String(error);
    if (message.includes("abort")) {
      return "The server did not respond in time.";
    }
    if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
      return "Could not reach the server. Check the URL and your connection.";
    }
    return "Connection failed. See the connection log for details.";
  }
  function strOrNull(value) {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
  function intOrZero(value) {
    if (typeof value === "number") return value;
    const n = parseInt(String(value != null ? value : "0"), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // src/storage/credentials-store.ts
  var KEY = "xtream_credentials";
  function loadCredentials() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const json = JSON.parse(raw);
      if (json.serverUrl && json.username && json.password) {
        return json;
      }
    } catch {
    }
    return null;
  }
  function saveCredentials(credentials) {
    localStorage.setItem(KEY, JSON.stringify(credentials));
  }
  function clearCredentials() {
    localStorage.removeItem(KEY);
  }

  // src/storage/watch-history.ts
  var MAX_ENTRIES = 30;
  function storageKey(accountKey) {
    return `watch_history_${accountKey}`;
  }
  function accountKeyFor(serverUrl, username) {
    return `${serverUrl}|${username}`;
  }
  function loadHistory(accountKey) {
    const raw = localStorage.getItem(storageKey(accountKey));
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  function saveHistory(accountKey, entries) {
    localStorage.setItem(
      storageKey(accountKey),
      JSON.stringify(entries.slice(0, MAX_ENTRIES))
    );
  }
  function upsertHistory(entry) {
    const entries = loadHistory(entry.accountKey).filter(
      (e) => e.contentKey !== entry.contentKey
    );
    entries.unshift(entry);
    saveHistory(entry.accountKey, entries);
  }
  function vodContentKey(streamId) {
    return `vod:${streamId}`;
  }
  function seriesEpisodeContentKey(seriesId, episodeId) {
    return `series:${seriesId}:ep:${episodeId}`;
  }
  function entryToPlaybackRequest(entry) {
    return {
      title: entry.title,
      url: entry.url,
      fallbackUrls: entry.fallbackUrls,
      kind: entry.kind,
      streamId: entry.vodStreamId,
      contentKey: entry.contentKey,
      imageUrl: entry.imageUrl,
      resumePositionMs: entry.positionMs > 5e3 ? entry.positionMs : 0,
      vodStreamId: entry.vodStreamId,
      seriesId: entry.seriesId,
      episodeId: entry.episodeId,
      seriesTitle: entry.seriesTitle
    };
  }

  // src/utils/content-search.ts
  function filterByTitle(items, query, titleFor) {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) => titleFor(item).toLowerCase().includes(needle)
    );
  }

  // src/utils/genre-grouper.ts
  function parseGenres(genreString) {
    if (!(genreString == null ? void 0 : genreString.trim())) return [];
    return genreString.split(/[,|/]/).map((g) => g.trim()).filter((g) => g.length > 0);
  }
  function groupByGenre(options) {
    var _a;
    const { items, genreFor, maxRows, minItemsPerRow = 1 } = options;
    const buckets = /* @__PURE__ */ new Map();
    for (const item of items) {
      const genres = parseGenres(genreFor(item));
      for (const genre of genres) {
        const key = genre.toLowerCase();
        const bucket = (_a = buckets.get(key)) != null ? _a : [];
        bucket.push(item);
        buckets.set(key, bucket);
      }
    }
    const sortedKeys = [...buckets.keys()].sort(
      (a, b) => {
        var _a2, _b, _c, _d;
        return ((_b = (_a2 = buckets.get(b)) == null ? void 0 : _a2.length) != null ? _b : 0) - ((_d = (_c = buckets.get(a)) == null ? void 0 : _c.length) != null ? _d : 0);
      }
    );
    const rows = [];
    for (const key of sortedKeys) {
      if (maxRows != null && rows.length >= maxRows) break;
      const bucketItems = buckets.get(key);
      if (bucketItems.length < minItemsPerRow) continue;
      rows.push({
        id: `genre:${key}`,
        title: displayGenreName(bucketItems, genreFor, key),
        items: bucketItems
      });
    }
    return rows;
  }
  function displayGenreName(items, genreFor, normalizedKey) {
    for (const item of items) {
      for (const genre of parseGenres(genreFor(item))) {
        if (genre.toLowerCase() === normalizedKey) return genre;
      }
    }
    return normalizedKey;
  }

  // src/utils/keyboard.ts
  function dismissTvKeyboard() {
    var _a, _b;
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    const w = window;
    try {
      (_b = (_a = w.PalmSystem) == null ? void 0 : _a.hideKeyboard) == null ? void 0 : _b.call(_a);
    } catch {
    }
  }

  // src/storage/vod-genre-cache.ts
  function storageKey2(accountKey) {
    return `vod_genre_cache_${accountKey}`;
  }
  function loadVodGenreCache(accountKey) {
    const raw = localStorage.getItem(storageKey2(accountKey));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      const out = {};
      for (const [key, value] of Object.entries(parsed)) {
        out[parseInt(key, 10)] = value;
      }
      return out;
    } catch {
      return {};
    }
  }
  function mergeVodGenreCache(accountKey, updates) {
    if (Object.keys(updates).length === 0) {
      return loadVodGenreCache(accountKey);
    }
    const existing = loadVodGenreCache(accountKey);
    Object.assign(existing, updates);
    const encoded = {};
    for (const [id, genre] of Object.entries(existing)) {
      encoded[String(id)] = genre;
    }
    localStorage.setItem(storageKey2(accountKey), JSON.stringify(encoded));
    return existing;
  }

  // src/services/vod-genre-indexer.ts
  var BATCH_SIZE = 20;
  async function indexMissingVodGenres(options) {
    const { api, accountKey, movies, isCancelled, onProgress } = options;
    let cached = { ...options.cached };
    const missing = movies.filter(
      (m) => {
        var _a;
        return !cached[m.streamId] && !((_a = m.genre) == null ? void 0 : _a.trim());
      }
    );
    if (missing.length === 0) return cached;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      if (isCancelled()) break;
      const batch = missing.slice(i, i + BATCH_SIZE);
      const updates = {};
      await Promise.all(
        batch.map(async (movie) => {
          var _a;
          try {
            const info = await api.getVodInfo(movie.streamId);
            const genre = (_a = info.genre) == null ? void 0 : _a.trim();
            if (genre) updates[movie.streamId] = genre;
          } catch {
          }
        })
      );
      if (Object.keys(updates).length > 0) {
        cached = mergeVodGenreCache(accountKey, updates);
        onProgress == null ? void 0 : onProgress(cached);
      }
    }
    return cached;
  }

  // src/state/app-state.ts
  var AppState = class {
    constructor() {
      this.screen = { name: "login" };
      this.api = null;
      this.accountKey = null;
      this.accountStatus = null;
      this.loginError = null;
      this.loginDebugLog = "";
      this.isLoggingIn = false;
      // Live browse
      this.liveCategories = [];
      this.liveSelectedCategory = null;
      this.liveItems = [];
      this.liveAllItems = [];
      this.liveSearchQuery = "";
      this.liveLoading = false;
      this.liveError = null;
      // Movies hub
      this.vodHubRows = [];
      this.vodAllMovies = [];
      this.vodGenreByStreamId = {};
      this.vodSearchQuery = "";
      this.vodLoading = false;
      this.vodLoadingGenres = false;
      this.vodError = null;
      this.vodGenreIndexGeneration = 0;
      // Series hub
      this.seriesHubRows = [];
      this.seriesAllItems = [];
      this.seriesSearchQuery = "";
      this.seriesLoading = false;
      this.seriesError = null;
      this.seriesDetail = null;
      this.seriesDetailLoading = false;
      this.seriesDetailError = null;
      this.listeners = /* @__PURE__ */ new Set();
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    notify() {
      for (const l of this.listeners) {
        l();
      }
    }
    async tryAutoLogin() {
      const creds = loadCredentials();
      if (!creds) {
        this.screen = { name: "login" };
        this.notify();
        return;
      }
      await this.login(creds, creds.serverUrl);
    }
    async login(credentials, originalServerInput) {
      var _a;
      this.isLoggingIn = true;
      this.loginError = null;
      this.loginDebugLog = "";
      this.notify();
      const api = new XtreamApi(credentials);
      const result = await api.authenticateWithDebug(originalServerInput);
      this.loginDebugLog = result.debugLog;
      this.isLoggingIn = false;
      if (!result.success) {
        this.loginError = (_a = result.summary) != null ? _a : "Login failed.";
        this.api = null;
        this.notify();
        return;
      }
      saveCredentials(credentials);
      this.api = api;
      this.accountKey = accountKeyFor(credentials.serverUrl, credentials.username);
      this.accountStatus = result.accountStatus;
      this.screen = { name: "home", tab: "live" };
      this.notify();
      await this.loadLive();
    }
    logout() {
      dismissTvKeyboard();
      this.vodGenreIndexGeneration += 1;
      clearCredentials();
      this.api = null;
      this.accountKey = null;
      this.accountStatus = null;
      this.screen = { name: "login" };
      this.resetBrowseState();
      this.notify();
    }
    setTab(tab) {
      if (this.screen.name !== "home") return;
      this.screen = { name: "home", tab };
      this.notify();
      if (tab === "live" && this.liveCategories.length === 0) {
        void this.loadLive();
      } else if (tab === "movies" && this.vodHubRows.length === 0 && !this.vodLoading) {
        void this.loadMovies();
      } else if (tab === "series" && this.seriesHubRows.length === 0 && !this.seriesLoading) {
        void this.loadSeriesList();
      }
    }
    async loadLive() {
      var _a;
      if (!this.api) return;
      this.liveLoading = true;
      this.liveError = null;
      this.notify();
      try {
        const categories = await this.api.getLiveCategories();
        this.liveCategories = categories;
        this.liveSelectedCategory = (_a = categories[0]) != null ? _a : null;
        if (this.liveSelectedCategory) {
          this.liveItems = await this.api.getLiveStreams(
            this.liveSelectedCategory.categoryId
          );
        } else {
          this.liveItems = [];
        }
      } catch (e) {
        this.liveError = String(e);
      } finally {
        this.liveLoading = false;
        this.notify();
      }
    }
    async selectLiveCategory(category) {
      if (!this.api) return;
      this.liveSelectedCategory = category;
      this.liveLoading = true;
      this.notify();
      try {
        this.liveItems = await this.api.getLiveStreams(category.categoryId);
      } catch (e) {
        this.liveError = String(e);
      } finally {
        this.liveLoading = false;
        this.notify();
      }
    }
    async setLiveSearch(query) {
      this.liveSearchQuery = query;
      if (!this.api) return;
      if (query.trim() && this.liveAllItems.length === 0) {
        this.liveLoading = true;
        this.notify();
        try {
          this.liveAllItems = await this.api.getLiveStreams();
        } catch (e) {
          this.liveError = String(e);
        } finally {
          this.liveLoading = false;
        }
      }
      this.notify();
    }
    filteredLiveItems() {
      const source = this.liveSearchQuery.trim() && this.liveAllItems.length > 0 ? this.liveAllItems : this.liveItems;
      return filterByTitle(source, this.liveSearchQuery, (i) => i.name);
    }
    async loadMovies() {
      if (!this.api || this.vodLoading) return;
      this.vodGenreIndexGeneration += 1;
      const generation = this.vodGenreIndexGeneration;
      this.vodLoading = true;
      this.vodError = null;
      this.vodHubRows = [];
      this.vodAllMovies = [];
      this.notify();
      try {
        this.vodAllMovies = await this.api.getVodStreams();
        if (this.accountKey) {
          this.vodGenreByStreamId = loadVodGenreCache(this.accountKey);
        } else {
          this.vodGenreByStreamId = {};
        }
        this.rebuildVodHubRows();
        this.vodLoading = false;
        this.notify();
        if (this.accountKey && this.api) {
          void this.indexVodGenresInBackground(generation);
        }
      } catch (e) {
        this.vodError = String(e);
        this.vodLoading = false;
        this.notify();
      }
    }
    rebuildVodHubRows() {
      this.vodHubRows = groupByGenre({
        items: this.vodAllMovies,
        genreFor: (m) => this.genreForMovie(m)
      });
    }
    genreForMovie(movie) {
      var _a;
      return (_a = this.vodGenreByStreamId[movie.streamId]) != null ? _a : movie.genre;
    }
    async indexVodGenresInBackground(generation) {
      if (!this.api || !this.accountKey) return;
      const missingCount = this.vodAllMovies.filter((m) => !this.genreForMovie(m)).length;
      if (missingCount === 0) return;
      this.vodLoadingGenres = true;
      this.notify();
      const api = this.api;
      const accountKey = this.accountKey;
      const movies = this.vodAllMovies;
      await indexMissingVodGenres({
        api,
        accountKey,
        movies,
        cached: this.vodGenreByStreamId,
        isCancelled: () => generation !== this.vodGenreIndexGeneration,
        onProgress: (genres) => {
          if (generation !== this.vodGenreIndexGeneration) return;
          this.vodGenreByStreamId = genres;
          this.rebuildVodHubRows();
          this.notify();
        }
      });
      if (generation !== this.vodGenreIndexGeneration) return;
      this.vodLoadingGenres = false;
      this.rebuildVodHubRows();
      this.notify();
    }
    setVodSearch(query) {
      this.vodSearchQuery = query;
      this.notify();
    }
    filteredVodItems() {
      const needle = this.vodSearchQuery.trim().toLowerCase();
      if (!needle) return [];
      return this.vodAllMovies.filter((item) => {
        const genre = this.genreForMovie(item);
        const hay = [item.name, genre].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
    vodHubRow(rowId) {
      var _a;
      return (_a = this.vodHubRows.find((r) => r.id === rowId)) != null ? _a : null;
    }
    async loadSeriesList() {
      if (!this.api || this.seriesLoading) return;
      this.seriesLoading = true;
      this.seriesError = null;
      this.seriesHubRows = [];
      this.seriesAllItems = [];
      this.notify();
      try {
        this.seriesAllItems = await this.api.getSeries();
        this.seriesHubRows = groupByGenre({
          items: this.seriesAllItems,
          genreFor: (s) => s.genre
        });
      } catch (e) {
        this.seriesError = String(e);
      } finally {
        this.seriesLoading = false;
        this.notify();
      }
    }
    setSeriesSearch(query) {
      this.seriesSearchQuery = query;
      this.notify();
    }
    filteredSeriesItems() {
      const needle = this.seriesSearchQuery.trim().toLowerCase();
      if (!needle) return [];
      return this.seriesAllItems.filter((item) => {
        const hay = [item.name, item.genre, item.plot, item.year].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
    seriesHubRow(rowId) {
      var _a;
      return (_a = this.seriesHubRows.find((r) => r.id === rowId)) != null ? _a : null;
    }
    openHubBrowse(tab, rowId) {
      this.screen = { name: "hub-browse", tab, rowId };
      this.notify();
    }
    openSeriesDetail(series) {
      this.screen = { name: "series-detail", series };
      this.seriesDetail = null;
      this.seriesDetailError = null;
      this.notify();
      void this.loadSeriesDetail(series);
    }
    async loadSeriesDetail(series) {
      if (!this.api) return;
      this.seriesDetailLoading = true;
      this.notify();
      try {
        this.seriesDetail = await this.api.getSeriesInfo(series.seriesId);
      } catch (e) {
        this.seriesDetailError = String(e);
      } finally {
        this.seriesDetailLoading = false;
        this.notify();
      }
    }
    goHome(tab = "live") {
      this.screen = { name: "home", tab };
      this.notify();
    }
    openPlayer(request) {
      this.screen = { name: "player", request };
      this.notify();
    }
    handleBack() {
      if (this.screen.name === "player") {
        this.goHome("live");
        return true;
      }
      if (this.screen.name === "hub-browse") {
        this.goHome(this.screen.tab);
        return true;
      }
      if (this.screen.name === "series-detail") {
        this.goHome("series");
        return true;
      }
      if (this.screen.name === "home") {
        return false;
      }
      return false;
    }
    resetBrowseState() {
      this.liveCategories = [];
      this.liveItems = [];
      this.liveAllItems = [];
      this.vodHubRows = [];
      this.vodAllMovies = [];
      this.vodGenreByStreamId = {};
      this.vodLoadingGenres = false;
      this.seriesHubRows = [];
      this.seriesAllItems = [];
      this.seriesDetail = null;
    }
  };
  var appState = new AppState();

  // src/screens/login.ts
  var APP_NAME = "Peders fantastiska IPTV spelare";
  var ICON_TV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`;
  function renderLogin(root2) {
    var _a, _b, _c;
    dismissTvKeyboard();
    const creds = {
      server: (_a = localStorage.getItem("login_draft_server")) != null ? _a : "",
      user: (_b = localStorage.getItem("login_draft_user")) != null ? _b : "",
      pass: (_c = localStorage.getItem("login_draft_pass")) != null ? _c : ""
    };
    root2.innerHTML = "";
    const screen = div("screen login-screen");
    const left = div("login-screen__left");
    const card = div("login-card");
    const iconWrap = div("login-card__icon");
    iconWrap.innerHTML = ICON_TV;
    const title = document.createElement("h1");
    title.className = "login-card__title";
    title.textContent = APP_NAME;
    const subtitle = document.createElement("p");
    subtitle.className = "login-card__subtitle";
    subtitle.textContent = "Connect with your Xtream Codes credentials";
    const form = document.createElement("form");
    form.className = "login-form";
    form.id = "login-form";
    form.append(
      field("Server URL", "server", creds.server, "http://host:8080 (no /player_api.php)"),
      field("Username", "username", creds.user),
      field("Password", "password", creds.pass, void 0, true)
    );
    if (appState.loginError) {
      const err = document.createElement("p");
      err.className = "error-banner";
      err.textContent = appState.loginError;
      form.append(err);
    }
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn filled focusable";
    submit.tabIndex = 0;
    submit.disabled = appState.isLoggingIn;
    submit.textContent = appState.isLoggingIn ? "Connecting\u2026" : "Connect";
    form.append(submit);
    card.append(iconWrap, title, subtitle, form);
    left.append(card);
    const right = document.createElement("aside");
    right.className = "login-screen__right";
    const panel = div("debug-panel");
    const panelHeader = div("debug-panel__header");
    const panelTitle = document.createElement("h2");
    panelTitle.textContent = "Connection log";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn focusable";
    clearBtn.id = "clear-log";
    clearBtn.tabIndex = 0;
    clearBtn.textContent = "Clear";
    panelHeader.append(panelTitle, clearBtn);
    const logBody = document.createElement("pre");
    logBody.className = "debug-panel__body";
    logBody.textContent = appState.loginDebugLog || "Log appears after connect attempt.";
    panel.append(panelHeader, logBody);
    right.append(panel);
    screen.append(left, right);
    root2.append(screen);
    form.addEventListener("submit", async (e) => {
      var _a2, _b2, _c2, _d;
      e.preventDefault();
      const fd = new FormData(form);
      let server = String((_a2 = fd.get("server")) != null ? _a2 : "").trim();
      const username = String((_b2 = fd.get("username")) != null ? _b2 : "").trim();
      const password = String((_c2 = fd.get("password")) != null ? _c2 : "");
      const embedded = extractEmbeddedCredentials(server);
      const finalUser = username || embedded.username || "";
      const finalPass = password || embedded.password || "";
      localStorage.setItem("login_draft_server", server);
      localStorage.setItem("login_draft_user", finalUser);
      localStorage.setItem("login_draft_pass", finalPass);
      try {
        server = normalizeServerUrl(server);
      } catch (err) {
        appState.loginError = String(err);
        appState.notify();
        return;
      }
      await appState.login(
        { serverUrl: server, username: finalUser, password: finalPass },
        String((_d = fd.get("server")) != null ? _d : "").trim()
      );
    });
    clearBtn.addEventListener("click", () => {
      appState.loginDebugLog = "";
      appState.notify();
    });
    submit.focus();
  }
  function div(className) {
    const node = document.createElement("div");
    node.className = className;
    return node;
  }
  function field(label, name, value, placeholder, password = false) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("input");
    input.type = password ? "password" : "text";
    input.name = name;
    input.className = "focusable";
    input.tabIndex = 0;
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    wrap.append(span, input);
    return wrap;
  }

  // src/ui/activate.ts
  function bindActivate(el, handler) {
    if (!el) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      handler();
    });
    el.addEventListener("keydown", (e) => {
      const code = e.keyCode;
      if (code === 13 || code === 28 || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handler();
      }
    });
  }

  // src/utils/search-field.ts
  function bindTvSearchFields(root2) {
    for (const btn of root2.querySelectorAll(".search-field--tv")) {
      const inputId = btn.dataset.searchInput;
      if (!inputId) continue;
      const wrap = btn.closest(".search-field-wrap");
      const input = root2.querySelector(`#${cssEscape(inputId)}`);
      if (!wrap || !input) continue;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openSearchEditor(wrap, btn, input);
      });
      input.addEventListener("blur", () => {
        closeSearchEditor(wrap, btn, input);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || e.keyCode === 461) {
          e.preventDefault();
          input.blur();
          btn.focus();
        }
      });
      syncSearchButtonLabel(btn, input);
    }
  }
  function openSearchEditor(wrap, btn, input) {
    wrap.classList.add("search-field-wrap--editing");
    input.removeAttribute("readonly");
    input.setAttribute("tabindex", "0");
    input.focus();
    try {
      input.setSelectionRange(input.value.length, input.value.length);
    } catch {
    }
  }
  function closeSearchEditor(wrap, btn, input) {
    wrap.classList.remove("search-field-wrap--editing");
    input.setAttribute("readonly", "true");
    input.setAttribute("tabindex", "-1");
    syncSearchButtonLabel(btn, input);
    dismissTvKeyboard();
  }
  function syncSearchButtonLabel(btn, input) {
    const textEl = btn.querySelector(".search-field__text");
    if (!textEl) return;
    const placeholder = input.placeholder || "Search";
    const value = input.value.trim();
    textEl.textContent = value || placeholder;
    textEl.classList.toggle("search-field__text--placeholder", !value);
  }
  function cssEscape(id) {
    if (typeof CSS !== "undefined" && "escape" in CSS) {
      return CSS.escape(id);
    }
    return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  // src/ui/focus.ts
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), .focusable';
  var ZONE_ORDER = ["header", "banner", "content", "tabs"];
  function initFocusRoot(root2) {
    const onKeyDown = (event) => {
      const key = event.key;
      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        const current = document.activeElement;
        const next = findNextFocusable(root2, current, key);
        if (next) {
          event.preventDefault();
          next.focus();
        }
        return;
      }
      if (key === "Enter" || event.keyCode === 13 || event.keyCode === 28) {
        const el = document.activeElement;
        if (!el) return;
        const searchInputId = el.dataset.searchInput;
        if (searchInputId && el.classList.contains("search-field--tv")) {
          event.preventDefault();
          const wrap = el.closest(".search-field-wrap");
          const input = root2.querySelector(`#${searchInputId}`);
          if (wrap && input instanceof HTMLInputElement) {
            openSearchEditor(wrap, el, input);
          }
          return;
        }
        if (el.classList.contains("focusable") && el.dataset.clickable === "true") {
          event.preventDefault();
          el.click();
        }
      }
    };
    root2.addEventListener("keydown", onKeyDown);
    return () => root2.removeEventListener("keydown", onKeyDown);
  }
  function findNextFocusable(root2, current, key) {
    const all = visibleFocusables(root2);
    if (all.length === 0) return null;
    if (!current || !all.includes(current)) {
      return pickDefaultFocus(root2, all);
    }
    const pool = buildPool(all, current, key);
    const next = pickDirectional(current, pool, key);
    if (!next && (key === "ArrowUp" || key === "ArrowDown")) {
      return pickCrossZone(current, all, key);
    }
    if (!next && (key === "ArrowLeft" || key === "ArrowRight")) {
      return pickEdgeFallback(current, all, key);
    }
    return next;
  }
  function buildPool(all, current, key) {
    const horizontalRow = current.closest(".horizontal-poster-row");
    if (horizontalRow && (key === "ArrowLeft" || key === "ArrowRight")) {
      return all.filter((el) => horizontalRow.contains(el));
    }
    const sub = subZone(current);
    if (sub === "sidebar") {
      if (key === "ArrowRight") {
        return all.filter((el) => subZone(el) === "catalog");
      }
      return all.filter((el) => subZone(el) === "sidebar");
    }
    if (sub === "catalog") {
      if (key === "ArrowLeft") {
        return all.filter((el) => subZone(el) === "sidebar");
      }
      return all.filter((el) => subZone(el) === "catalog" || subZone(el) === "content");
    }
    if (sub === "content" || sub === "hub") {
      return all.filter((el) => {
        const z = subZone(el);
        return z === "content" || z === "hub";
      });
    }
    const zone = topZone(current);
    if (key === "ArrowLeft" || key === "ArrowRight") {
      return all.filter((el) => topZone(el) === zone);
    }
    return all.filter((el) => topZone(el) === zone);
  }
  function pickDirectional(current, pool, key) {
    const currentRect = current.getBoundingClientRect();
    const horizontalRow = current.closest(".horizontal-poster-row");
    let best = null;
    let bestScore = Infinity;
    for (const candidate of pool) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2);
      const dy = rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2);
      const minPrimary = horizontalRow ? 4 : 8;
      if (key === "ArrowLeft" && dx >= -minPrimary) continue;
      if (key === "ArrowRight" && dx <= minPrimary) continue;
      if (key === "ArrowUp" && dy >= -minPrimary) continue;
      if (key === "ArrowDown" && dy <= minPrimary) continue;
      const primary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dx) : Math.abs(dy);
      let secondary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
      if (horizontalRow && (key === "ArrowLeft" || key === "ArrowRight")) {
        secondary *= 10;
      }
      const score = primary * 1e3 + secondary;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
  function pickCrossZone(current, all, key) {
    var _a;
    const sub = subZone(current);
    if (key === "ArrowDown" && sub === "sidebar") {
      const catalogPool = all.filter((el) => subZone(el) === "catalog");
      return nearestByHorizontal(current, catalogPool);
    }
    if (key === "ArrowDown" && (sub === "catalog" || sub === "hub")) {
      const tabPool = all.filter((el) => topZone(el) === "tabs");
      return nearestByHorizontal(current, tabPool);
    }
    if (key === "ArrowUp" && (sub === "catalog" || sub === "hub" || sub === "sidebar")) {
      const bannerPool = all.filter((el) => topZone(el) === "banner");
      if (bannerPool.length > 0) {
        return nearestByHorizontal(current, bannerPool);
      }
      const headerPool = all.filter((el) => topZone(el) === "header");
      if (headerPool.length > 0) {
        return nearestByHorizontal(current, headerPool);
      }
    }
    if (key === "ArrowUp" && topZone(current) === "tabs") {
      const contentPool = all.filter((el) => {
        const z = subZone(el);
        return z === "catalog" || z === "hub" || z === "sidebar";
      });
      if (contentPool.length > 0) {
        return nearestByVertical(current, contentPool, "up");
      }
    }
    const zone = topZone(current);
    const idx = ZONE_ORDER.indexOf(zone);
    if (idx < 0) return null;
    const step = key === "ArrowDown" ? 1 : -1;
    for (let i = idx + step; i >= 0 && i < ZONE_ORDER.length; i += step) {
      const targetZone = ZONE_ORDER[i];
      const pool = all.filter((el) => topZone(el) === targetZone);
      if (pool.length === 0) continue;
      return (_a = nearestByVertical(current, pool, key === "ArrowDown" ? "down" : "up")) != null ? _a : pool[0];
    }
    return null;
  }
  function pickEdgeFallback(current, all, key) {
    const sub = subZone(current);
    if (key === "ArrowLeft" && sub === "catalog") {
      const sidebarPool = all.filter((el) => subZone(el) === "sidebar");
      return nearestByHorizontal(current, sidebarPool);
    }
    if (key === "ArrowRight" && sub === "sidebar") {
      const catalogPool = all.filter((el) => subZone(el) === "catalog");
      return nearestByHorizontal(current, catalogPool);
    }
    return null;
  }
  function nearestByHorizontal(current, pool) {
    if (pool.length === 0) return null;
    const currentRect = current.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;
    for (const candidate of pool) {
      const rect = candidate.getBoundingClientRect();
      const dx = Math.abs(
        rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2)
      );
      const dy = Math.abs(
        rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2)
      );
      const score = dy * 1e3 + dx;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
  function nearestByVertical(current, pool, direction) {
    const currentRect = current.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;
    for (const candidate of pool) {
      const rect = candidate.getBoundingClientRect();
      const dx = Math.abs(
        rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2)
      );
      const dy = direction === "down" ? rect.top - currentRect.bottom : currentRect.top - rect.bottom;
      if (dy < -4) continue;
      const score = (direction === "down" ? dy : dy) * 1e3 + dx;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
  function topZone(el) {
    const node = el.closest("[data-focus-zone]");
    const zone = node == null ? void 0 : node.getAttribute("data-focus-zone");
    if (zone === "header" || zone === "banner" || zone === "tabs") {
      return zone;
    }
    return "content";
  }
  function subZone(el) {
    var _a;
    const zone = (_a = el.closest("[data-focus-zone]")) == null ? void 0 : _a.getAttribute("data-focus-zone");
    if (zone === "sidebar" || zone === "catalog" || zone === "hub") {
      return zone;
    }
    if (el.closest(".category-sidebar")) return "sidebar";
    if (el.closest(".content-panel")) return "catalog";
    if (el.closest(".hub-scroll")) return "hub";
    if (zone === "content") return "content";
    return topZone(el);
  }
  function visibleFocusables(root2) {
    return Array.from(root2.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
  }
  function pickDefaultFocus(root2, all) {
    var _a;
    const content = root2.querySelector('[data-focus-zone="content"], [data-focus-zone="catalog"], [data-focus-zone="hub"], [data-focus-zone="sidebar"]');
    if (content) {
      const inContent = all.find((el) => content.contains(el));
      if (inContent) return inContent;
    }
    return (_a = all[0]) != null ? _a : null;
  }
  function focusFirst(root2) {
    var _a;
    (_a = pickDefaultFocus(root2, visibleFocusables(root2))) == null ? void 0 : _a.focus();
  }

  // src/ui/markup.ts
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function posterCardHtml(options) {
    const img = options.imageUrl ? `<img src="${escapeAttr(options.imageUrl)}" alt="" loading="lazy" />` : `<span class="poster-placeholder" aria-hidden="true">${options.placeholderIcon}</span>`;
    let progressBar = "";
    if (options.progress != null && options.progress > 0) {
      const pct = Math.min(100, options.progress * 100);
      progressBar = '<div class="poster-progress"><span style="width:' + pct + '%"></span></div>';
    }
    return [
      `<article class="poster-card focusable" tabindex="0" data-clickable="true" ${options.attrs}>`,
      `<div class="poster-card__image">${img}${progressBar}</div>`,
      `<span class="poster-card__title">${escapeHtml(options.title)}</span>`,
      `</article>`
    ].join("");
  }
  function contentTileHtml(options) {
    const img = options.imageUrl ? `<img src="${escapeAttr(options.imageUrl)}" alt="" onerror="this.classList.add('content-tile__img--broken')" />` : "";
    const placeholder = '<span class="content-tile__placeholder" aria-hidden="true">\u25B6</span>';
    return [
      `<article class="content-tile focusable" tabindex="0" data-clickable="true" ${options.attrs}>`,
      `<div class="content-tile__media">${img}${placeholder}</div>`,
      `<span class="content-tile__title">${escapeHtml(options.title)}</span>`,
      `</article>`
    ].join("");
  }
  function hubRowHtml(title, rowId, postersHtml, itemCount) {
    return [
      `<section class="hub-row" data-row-id="${escapeAttr(rowId)}">`,
      `<div class="content-row">`,
      `<h2 class="content-row__title">${escapeHtml(title)}</h2>`,
      `<button type="button" class="content-row__see-all focusable" data-see-all="${escapeAttr(rowId)}" tabindex="0">`,
      `See all (${itemCount})`,
      `</button>`,
      `</div>`,
      `<div class="horizontal-poster-row-clip"><div class="horizontal-poster-row">${postersHtml}</div></div>`,
      `</section>`
    ].join("");
  }
  function loadingStateHtml(message) {
    return `<div class="state-panel"><div class="spinner" aria-hidden="true"></div><p>${escapeHtml(message)}</p></div>`;
  }
  function errorStateHtml(message, retryId) {
    return `<div class="state-panel state-panel--error">
    <p class="error-banner">${escapeHtml(message)}</p>
    <button type="button" class="btn filled focusable" id="${escapeAttr(retryId)}" tabindex="0">Retry</button>
  </div>`;
  }
  function emptyStateHtml(message) {
    return `<div class="state-panel"><p class="state-panel__message">${escapeHtml(message)}</p></div>`;
  }

  // src/screens/home.ts
  var APP_NAME2 = "Peders fantastiska IPTV spelare";
  var SEARCH_DEBOUNCE_MS = 300;
  var MAX_GRID_ITEMS = 300;
  var debounceTimers = /* @__PURE__ */ new Map();
  function renderHome(root2) {
    if (appState.screen.name !== "home") return;
    const tab = appState.screen.tab;
    const accountSummary = appState.accountStatus ? accountSuccessSummary(appState.accountStatus) : null;
    root2.innerHTML = `
    <div class="screen home-screen">
      <header class="app-header" data-focus-zone="header">
        <h1 class="app-header__title">${escapeHtml(APP_NAME2)}</h1>
        <button type="button" class="btn icon focusable" id="logout-btn" tabindex="0" aria-label="Log out">
          ${logoutIconSvg()}
        </button>
      </header>
      ${accountSummary ? `<div class="account-banner" role="status" data-focus-zone="banner">
              <span class="account-banner__icon" aria-hidden="true">${verifiedIconSvg()}</span>
              <span>${escapeHtml(accountSummary)}</span>
            </div>` : ""}
      <main class="home-body" id="home-main" data-focus-zone="content"></main>
      <nav class="bottom-nav" role="navigation" aria-label="Browse" data-focus-zone="tabs">
        ${bottomNavItem("live", "Live TV", liveTvIconSvg(), tab)}
        ${bottomNavItem("movies", "Movies", movieIconSvg(), tab)}
        ${bottomNavItem("series", "Series", seriesIconSvg(), tab)}
      </nav>
    </div>
  `;
    bindActivate(root2.querySelector("#logout-btn"), () => {
      appState.logout();
    });
    for (const btn of root2.querySelectorAll("[data-tab]")) {
      bindActivate(btn, () => {
        appState.setTab(btn.dataset.tab);
      });
    }
    const main = root2.querySelector("#home-main");
    if (tab === "live") {
      renderLiveTab(main);
    } else if (tab === "movies") {
      renderMoviesTab(main);
    } else {
      renderSeriesTab(main);
    }
    focusFirst(root2);
    bindTvSearchFields(root2);
  }
  function renderHubBrowse(root2) {
    if (appState.screen.name !== "hub-browse") return;
    const { tab, rowId } = appState.screen;
    const row = tab === "movies" ? appState.vodHubRow(rowId) : appState.seriesHubRow(rowId);
    if (!row) {
      root2.innerHTML = `
      <div class="screen hub-browse-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="hub-back" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">Browse</h1>
        </header>
        ${emptyStateHtml("This row is no longer available.")}
      </div>
    `;
      bindActivate(root2.querySelector("#hub-back"), () => {
        appState.goHome(tab);
      });
      focusFirst(root2);
      return;
    }
    const posters = tab === "movies" ? row.items.map((item) => moviePoster(item)).join("") : row.items.map((item) => seriesPoster(item)).join("");
    root2.innerHTML = `
    <div class="screen hub-browse-screen">
      <header class="app-header">
        <button type="button" class="btn icon focusable" id="hub-back" tabindex="0" aria-label="Back">
          ${backIconSvg()}
        </button>
        <h1 class="app-header__title">${escapeHtml(row.title)}</h1>
      </header>
      ${row.items.length === 0 ? emptyStateHtml("No titles in this row.") : `<div class="hub-browse-grid">${posters}</div>`}
    </div>
  `;
    bindActivate(root2.querySelector("#hub-back"), () => {
      appState.goHome(tab);
    });
    if (tab === "movies") {
      bindMoviePosters(root2, (id) => row.items.find((i) => i.streamId === id));
    } else {
      bindSeriesPosters(root2, (id) => row.items.find((i) => i.seriesId === id));
    }
    focusFirst(root2);
  }
  function renderSeriesDetail(root2) {
    var _a, _b;
    if (appState.screen.name !== "series-detail") return;
    const series = appState.screen.series;
    const title = series.name;
    if (appState.seriesDetailLoading) {
      root2.innerHTML = `
      <div class="screen series-detail-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">${escapeHtml(title)}</h1>
        </header>
        ${loadingStateHtml("Loading episodes\u2026")}
      </div>
    `;
      bindActivate(root2.querySelector("#back-series"), () => {
        appState.goHome("series");
      });
      focusFirst(root2);
      return;
    }
    if (appState.seriesDetailError || !appState.seriesDetail) {
      root2.innerHTML = `
      <div class="screen series-detail-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">${escapeHtml(title)}</h1>
        </header>
        ${errorStateHtml((_a = appState.seriesDetailError) != null ? _a : "No data", "retry-series-detail")}
      </div>
    `;
      bindActivate(root2.querySelector("#back-series"), () => {
        appState.goHome("series");
      });
      bindActivate(root2.querySelector("#retry-series-detail"), () => {
        void appState.loadSeriesDetail(series);
      });
      focusFirst(root2);
      return;
    }
    const info = appState.seriesDetail;
    const seasons = Object.keys(info.episodes).sort(
      (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)
    );
    let episodesHtml = "";
    for (const season of seasons) {
      const eps = (_b = info.episodes[season]) != null ? _b : [];
      episodesHtml += `<section class="season-block"><h3>Season ${escapeHtml(season)}</h3><div class="episode-list">`;
      for (const ep of eps) {
        episodesHtml += `<button type="button" class="episode-item focusable" tabindex="0"
        data-episode-id="${ep.id}" data-season="${escapeAttr(season)}">${escapeHtml(ep.title)}</button>`;
      }
      episodesHtml += "</div></section>";
    }
    root2.innerHTML = `
    <div class="screen series-detail-screen">
      <header class="app-header">
        <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
          ${backIconSvg()}
        </button>
        <h1 class="app-header__title">${escapeHtml(title)}</h1>
      </header>
      <div class="series-detail-body">
        ${info.info.plot ? `<p class="series-plot">${escapeHtml(info.info.plot)}</p>` : ""}
        <div class="series-episodes">${episodesHtml}</div>
      </div>
    </div>
  `;
    bindActivate(root2.querySelector("#back-series"), () => {
      appState.goHome("series");
    });
    for (const btn of root2.querySelectorAll("[data-episode-id]")) {
      bindActivate(btn, () => {
        var _a2, _b2, _c;
        const episodeId = parseInt((_a2 = btn.dataset.episodeId) != null ? _a2 : "0", 10);
        const season = (_b2 = btn.dataset.season) != null ? _b2 : "";
        const ep = (_c = info.episodes[season]) == null ? void 0 : _c.find((e) => e.id === episodeId);
        if (!ep || !appState.api) return;
        const req = {
          title: `${title} \xB7 ${ep.title}`,
          url: appState.api.buildEpisodeUrl(ep),
          fallbackUrls: [],
          kind: "series",
          streamId: null,
          contentKey: seriesEpisodeContentKey(series.seriesId, episodeId),
          imageUrl: series.cover,
          resumePositionMs: 0,
          vodStreamId: null,
          seriesId: series.seriesId,
          episodeId,
          seriesTitle: title
        };
        appState.openPlayer(req);
      });
    }
    focusFirst(root2);
  }
  function renderLiveTab(main) {
    if (appState.liveLoading && appState.liveCategories.length === 0) {
      main.innerHTML = loadingStateHtml("Loading categories\u2026");
      return;
    }
    if (appState.liveError) {
      main.innerHTML = errorStateHtml(appState.liveError, "retry-live");
      bindActivate(main.querySelector("#retry-live"), () => {
        void appState.loadLive();
      });
      return;
    }
    const items = appState.filteredLiveItems();
    main.innerHTML = `
    <div class="browse-layout">
      <aside class="category-sidebar" data-focus-zone="sidebar">
        <ul class="category-list" id="category-list">
          ${appState.liveCategories.map(
      (c) => {
        var _a;
        return `
            <li>
              <button type="button" class="category-item focusable ${((_a = appState.liveSelectedCategory) == null ? void 0 : _a.categoryId) === c.categoryId ? "category-item--active" : ""}" data-category-id="${escapeAttr(c.categoryId)}" tabindex="0">
                ${escapeHtml(c.categoryName)}
              </button>
            </li>`;
      }
    ).join("")}
        </ul>
      </aside>
      <section class="content-panel" data-focus-zone="catalog">
        ${hubSearchField("live-search", "Search channels\u2026", appState.liveSearchQuery)}
        ${appState.liveLoading ? loadingStateHtml("Loading channels\u2026") : items.length === 0 ? emptyStateHtml("No channels in this category.") : `<div class="live-grid" id="live-grid">
                  ${items.slice(0, MAX_GRID_ITEMS).map(
      (item) => contentTileHtml({
        title: item.name,
        imageUrl: item.streamIcon,
        attrs: `data-stream-id="${item.streamId}" data-kind="live"`
      })
    ).join("")}
                </div>`}
      </section>
    </div>
  `;
    const searchInput = main.querySelector("#live-search");
    if (searchInput) {
      bindDebouncedSearch(searchInput, "live", (query) => {
        void appState.setLiveSearch(query);
      });
    }
    for (const btn of main.querySelectorAll("[data-category-id]")) {
      bindActivate(btn, () => {
        const id = btn.dataset.categoryId;
        const cat = appState.liveCategories.find((c) => c.categoryId === id);
        if (cat) void appState.selectLiveCategory(cat);
      });
    }
    bindGridPlayback(main, (el) => {
      var _a;
      const id = parseInt((_a = el.dataset.streamId) != null ? _a : "0", 10);
      const item = appState.filteredLiveItems().find((i) => i.streamId === id);
      return item ? livePlaybackRequest(item) : null;
    });
  }
  function renderMoviesTab(main) {
    if (appState.vodLoading && appState.vodHubRows.length === 0) {
      main.innerHTML = loadingStateHtml("Loading catalog\u2026");
      return;
    }
    if (appState.vodError) {
      main.innerHTML = errorStateHtml(appState.vodError, "retry-vod");
      bindActivate(main.querySelector("#retry-vod"), () => {
        void appState.loadMovies();
      });
      return;
    }
    const isSearching = appState.vodSearchQuery.trim().length > 0;
    main.innerHTML = `
    <div class="hub-scroll" data-focus-zone="hub">
      ${hubSearchField("vod-search", "Search movies by title or genre\u2026", appState.vodSearchQuery)}
      ${isSearching ? renderMoviesSearchResults() : renderMoviesHubBrowse()}
    </div>
  `;
    const searchInput = main.querySelector("#vod-search");
    if (searchInput) {
      bindDebouncedSearch(searchInput, "vod", (query) => {
        appState.setVodSearch(query);
      });
    }
    if (isSearching) {
      bindMoviePosters(main, (id) => appState.filteredVodItems().find((i) => i.streamId === id));
    } else {
      bindRecentlyWatched(main, "vod");
      bindSeeAll(main, "movies");
      bindMoviePosters(main, (id) => findVodItem(id));
    }
  }
  function renderSeriesTab(main) {
    if (appState.seriesLoading && appState.seriesHubRows.length === 0) {
      main.innerHTML = loadingStateHtml("Loading catalog\u2026");
      return;
    }
    if (appState.seriesError) {
      main.innerHTML = errorStateHtml(appState.seriesError, "retry-series");
      bindActivate(main.querySelector("#retry-series"), () => {
        void appState.loadSeriesList();
      });
      return;
    }
    const isSearching = appState.seriesSearchQuery.trim().length > 0;
    main.innerHTML = `
    <div class="hub-scroll" data-focus-zone="hub">
      ${hubSearchField("series-search", "Search series by title, cast, or genre\u2026", appState.seriesSearchQuery)}
      ${isSearching ? renderSeriesSearchResults() : renderSeriesHubBrowse()}
    </div>
  `;
    const searchInput = main.querySelector("#series-search");
    if (searchInput) {
      bindDebouncedSearch(searchInput, "series", (query) => {
        appState.setSeriesSearch(query);
      });
    }
    if (isSearching) {
      bindSeriesPosters(main, (id) => appState.filteredSeriesItems().find((i) => i.seriesId === id));
    } else {
      bindRecentlyWatched(main, "series");
      bindSeeAll(main, "series");
      bindSeriesPosters(main, (id) => findSeriesItem(id));
    }
  }
  function renderMoviesSearchResults() {
    const items = appState.filteredVodItems().slice(0, MAX_GRID_ITEMS);
    if (items.length === 0) {
      return emptyStateHtml("No movies match your search.");
    }
    return `<div class="hub-search-grid">
    ${items.map((item) => moviePoster(item)).join("")}
  </div>`;
  }
  function renderSeriesSearchResults() {
    const items = appState.filteredSeriesItems().slice(0, MAX_GRID_ITEMS);
    if (items.length === 0) {
      return emptyStateHtml("No series match your search.");
    }
    return `<div class="hub-search-grid">
    ${items.map((item) => seriesPoster(item)).join("")}
  </div>`;
  }
  function renderMoviesHubBrowse() {
    const history = recentlyWatchedEntries("vod");
    const rowsHtml = appState.vodHubRows.map(
      (row) => hubRowHtml(
        row.title,
        row.id,
        row.items.map((item) => moviePoster(item)).join(""),
        row.items.length
      )
    ).join("");
    if (history.length === 0 && rowsHtml === "") {
      if (appState.vodLoadingGenres) {
        return `<p class="status-msg">Loading genres from your library\u2026</p>`;
      }
      return emptyStateHtml("No movies found.");
    }
    const loadingGenres = appState.vodLoadingGenres && appState.vodHubRows.length === 0 ? `<p class="status-msg">Loading genres from your library\u2026</p>` : "";
    return `${recentlyWatchedSection(history)}${loadingGenres}${rowsHtml}`;
  }
  function renderSeriesHubBrowse() {
    const history = recentlyWatchedEntries("series");
    const rowsHtml = appState.seriesHubRows.map(
      (row) => hubRowHtml(
        row.title,
        row.id,
        row.items.map((item) => seriesPoster(item)).join(""),
        row.items.length
      )
    ).join("");
    if (history.length === 0 && rowsHtml === "") {
      return emptyStateHtml("No series found.");
    }
    return `${recentlyWatchedSection(history)}${rowsHtml}`;
  }
  function recentlyWatchedSection(entries) {
    if (entries.length === 0) return "";
    const posters = entries.map((entry) => {
      const progress = entry.durationMs != null && entry.durationMs > 0 ? entry.positionMs / entry.durationMs : void 0;
      return posterCardHtml({
        title: entry.title,
        imageUrl: entry.imageUrl,
        placeholderIcon: entry.kind === "vod" ? "\u{1F3AC}" : "\u{1F4FA}",
        progress,
        attrs: `data-resume-key="${escapeAttr(entry.contentKey)}"`
      });
    }).join("");
    return `
    <section class="hub-row">
      <div class="content-row">
        <h2 class="content-row__title">Recently watched</h2>
      </div>
      <div class="horizontal-poster-row-clip"><div class="horizontal-poster-row">${posters}</div></div>
    </section>
  `;
  }
  function recentlyWatchedEntries(kind) {
    if (!appState.accountKey) return [];
    return loadHistory(appState.accountKey).filter((e) => e.kind === kind);
  }
  function hubSearchField(id, placeholder, value) {
    const display = value.trim() || placeholder;
    const isPlaceholder = !value.trim();
    return `
    <div class="search-field-wrap hub-search-wrap">
      <button type="button" class="search-field search-field--tv focusable" tabindex="0"
        data-search-input="${escapeAttr(id)}" aria-label="${escapeAttr(placeholder)}">
        <span class="search-field__icon">\u2315</span>
        <span class="search-field__text${isPlaceholder ? " search-field__text--placeholder" : ""}">${escapeHtml(display)}</span>
      </button>
      <input type="search" id="${escapeAttr(id)}" class="search-field__input" tabindex="-1"
        readonly placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}" />
    </div>
  `;
  }
  function bottomNavItem(id, label, icon, active) {
    const isActive = id === active;
    return `
    <button type="button" class="nav-item focusable ${isActive ? "nav-item--active" : ""}"
      data-tab="${id}" tabindex="0" aria-current="${isActive ? "page" : "false"}">
      <span class="nav-item__icon">${icon}</span>
      <span class="nav-item__label">${escapeHtml(label)}</span>
    </button>
  `;
  }
  function moviePoster(item) {
    return posterCardHtml({
      title: item.name,
      imageUrl: item.streamIcon,
      placeholderIcon: "\u{1F3AC}",
      attrs: `data-stream-id="${item.streamId}" data-kind="vod"`
    });
  }
  function seriesPoster(item) {
    return posterCardHtml({
      title: item.name,
      imageUrl: item.cover,
      placeholderIcon: "\u{1F4FA}",
      attrs: `data-series-id="${item.seriesId}"`
    });
  }
  function findVodItem(streamId) {
    for (const row of appState.vodHubRows) {
      const item = row.items.find((i) => i.streamId === streamId);
      if (item) return item;
    }
    return appState.vodAllMovies.find((i) => i.streamId === streamId);
  }
  function findSeriesItem(seriesId) {
    for (const row of appState.seriesHubRows) {
      const item = row.items.find((i) => i.seriesId === seriesId);
      if (item) return item;
    }
    return appState.seriesAllItems.find((i) => i.seriesId === seriesId);
  }
  function livePlaybackRequest(item) {
    if (!appState.api) return null;
    const urls = appState.api.buildLiveStreamUrlCandidates(item);
    return {
      title: item.name,
      url: urls[0],
      fallbackUrls: urls.slice(1),
      kind: "live",
      streamId: item.streamId,
      contentKey: null,
      imageUrl: item.streamIcon,
      resumePositionMs: 0,
      vodStreamId: null,
      seriesId: null,
      episodeId: null,
      seriesTitle: null
    };
  }
  function vodPlaybackRequest(item) {
    if (!appState.api) return null;
    return {
      title: item.name,
      url: appState.api.buildVodUrl(item),
      fallbackUrls: [],
      kind: "vod",
      streamId: item.streamId,
      contentKey: vodContentKey(item.streamId),
      imageUrl: item.streamIcon,
      resumePositionMs: 0,
      vodStreamId: item.streamId,
      seriesId: null,
      episodeId: null,
      seriesTitle: null
    };
  }
  function bindDebouncedSearch(input, key, onSearch) {
    input.addEventListener("input", () => {
      const existing = debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        key,
        setTimeout(() => {
          debounceTimers.delete(key);
          void onSearch(input.value);
        }, SEARCH_DEBOUNCE_MS)
      );
    });
  }
  function bindGridPlayback(container, buildRequest) {
    for (const el of container.querySelectorAll('[data-stream-id][data-kind="live"]')) {
      bindActivate(el, () => {
        const req = buildRequest(el);
        if (req) appState.openPlayer(req);
      });
    }
  }
  function bindMoviePosters(container, resolveItem) {
    for (const el of container.querySelectorAll('[data-stream-id][data-kind="vod"]')) {
      bindActivate(el, () => {
        var _a;
        const id = parseInt((_a = el.dataset.streamId) != null ? _a : "0", 10);
        const item = resolveItem(id);
        if (!item) return;
        const req = vodPlaybackRequest(item);
        if (req) appState.openPlayer(req);
      });
    }
  }
  function bindSeriesPosters(container, resolveItem) {
    for (const el of container.querySelectorAll("[data-series-id]")) {
      bindActivate(el, () => {
        var _a;
        const id = parseInt((_a = el.dataset.seriesId) != null ? _a : "0", 10);
        const series = resolveItem(id);
        if (series) appState.openSeriesDetail(series);
      });
    }
  }
  function bindSeeAll(container, tab) {
    for (const btn of container.querySelectorAll("[data-see-all]")) {
      bindActivate(btn, () => {
        const rowId = btn.dataset.seeAll;
        appState.openHubBrowse(tab, rowId);
      });
    }
  }
  function bindRecentlyWatched(container, kind) {
    const history = recentlyWatchedEntries(kind);
    for (const el of container.querySelectorAll("[data-resume-key]")) {
      bindActivate(el, () => {
        const key = el.dataset.resumeKey;
        const entry = history.find((h) => h.contentKey === key);
        if (entry) appState.openPlayer(entryToPlaybackRequest(entry));
      });
    }
  }
  function logoutIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>`;
  }
  function backIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
  }
  function verifiedIconSvg() {
    return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`;
  }
  function liveTvIconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`;
  }
  function movieIconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`;
  }
  function seriesIconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>`;
  }

  // src/screens/player.ts
  var activeCleanup = null;
  function renderPlayer(root2, request) {
    var _a, _b;
    activeCleanup == null ? void 0 : activeCleanup();
    activeCleanup = null;
    const urls = [request.url, ...request.fallbackUrls];
    let urlIndex = 0;
    const log = [
      "=== Playback debug ===",
      `Title: ${request.title}`,
      `Kind: ${request.kind}`,
      ...urls.map((u, i) => `  ${i + 1}. ${u}`),
      ""
    ];
    root2.innerHTML = `
    <div class="screen player-screen">
      <video id="player-video" class="player-video" autoplay></video>
      <div class="player-overlay">
        <h2 class="player-title">${escapeHtml2(request.title)}</h2>
        <p class="player-status" id="player-status">Loading\u2026</p>
        <div class="player-actions">
          <button type="button" class="btn focusable" id="player-back" tabindex="0">Back</button>
          <button type="button" class="btn focusable" id="toggle-debug" tabindex="0">Debug log</button>
        </div>
        <pre class="player-debug hidden" id="player-debug"></pre>
      </div>
    </div>
  `;
    const video = root2.querySelector("#player-video");
    const statusEl = root2.querySelector("#player-status");
    const debugEl = root2.querySelector("#player-debug");
    const appendLog = (line) => {
      log.push(line);
      debugEl.textContent = log.join("\n");
    };
    const setStatus = (text) => {
      statusEl.textContent = text;
    };
    const tryNextUrl = () => {
      if (urlIndex >= urls.length) {
        setStatus("All stream URLs failed.");
        appendLog("Result: FAILED (exhausted candidates)");
        return;
      }
      const url = urls[urlIndex];
      urlIndex += 1;
      appendLog(`Trying URL ${urlIndex}/${urls.length}: ${url}`);
      setStatus(`Loading stream ${urlIndex}/${urls.length}\u2026`);
      video.pause();
      video.removeAttribute("src");
      while (video.firstChild) {
        video.removeChild(video.firstChild);
      }
      const source = document.createElement("source");
      source.src = url;
      if (url.includes(".m3u8")) {
        source.type = "application/vnd.apple.mpegurl";
      } else if (url.includes(".ts")) {
        source.type = "video/mp2t";
      } else {
        source.type = "video/mp4";
      }
      if (request.resumePositionMs > 5e3 && request.kind !== "live") {
        const options = {
          option: {
            transmission: {
              playTime: { start: request.resumePositionMs }
            }
          }
        };
        source.type = `${source.type};mediaOption=${encodeURIComponent(JSON.stringify(options))}`;
      }
      video.appendChild(source);
      video.load();
      void video.play().catch((err) => {
        appendLog(`play() rejected: ${String(err)}`);
      });
    };
    const onError = () => {
      appendLog(`media error on URL ${urlIndex}`);
      tryNextUrl();
    };
    const onPlaying = () => {
      setStatus("Playing");
      appendLog("Playback started");
    };
    const onWaiting = () => setStatus("Buffering\u2026");
    let progressTimer = null;
    const saveProgress = () => {
      var _a2;
      if (!appState.accountKey || request.kind === "live") return;
      const accountKey = appState.accountKey;
      const contentKey = (_a2 = request.contentKey) != null ? _a2 : request.vodStreamId != null ? `vod:${request.vodStreamId}` : request.title;
      const entry = {
        accountKey,
        contentKey,
        kind: request.kind,
        title: request.title,
        url: request.url,
        fallbackUrls: request.fallbackUrls,
        imageUrl: request.imageUrl,
        positionMs: Math.floor(video.currentTime * 1e3),
        durationMs: video.duration ? Math.floor(video.duration * 1e3) : null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        vodStreamId: request.vodStreamId,
        seriesId: request.seriesId,
        episodeId: request.episodeId,
        seriesTitle: request.seriesTitle,
        subtitle: null
      };
      upsertHistory(entry);
    };
    video.addEventListener("error", onError);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    progressTimer = setInterval(() => {
      if (!video.paused && request.kind !== "live" && video.currentTime > 5) {
        saveProgress();
      }
    }, 15e3);
    (_a = root2.querySelector("#player-back")) == null ? void 0 : _a.addEventListener("click", () => {
      saveProgress();
      appState.goHome("live");
    });
    (_b = root2.querySelector("#toggle-debug")) == null ? void 0 : _b.addEventListener("click", () => {
      debugEl.classList.toggle("hidden");
    });
    debugEl.textContent = log.join("\n");
    tryNextUrl();
    focusFirst(root2);
    activeCleanup = () => {
      if (progressTimer) clearInterval(progressTimer);
      video.removeEventListener("error", onError);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.pause();
      while (video.firstChild) video.removeChild(video.firstChild);
    };
  }
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // src/main.ts
  var root;
  var renderScheduled = false;
  function showFatalError(error) {
    var _a;
    const message = error instanceof Error ? (_a = error.stack) != null ? _a : error.message : String(error);
    if (root) {
      root.innerHTML = `<pre class="fatal-error">${escapeHtml3(message)}</pre>`;
    }
  }
  function escapeHtml3(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function render() {
    try {
      const screen = appState.screen;
      if (screen.name === "login") {
        renderLogin(root);
      } else if (screen.name === "home") {
        renderHome(root);
      } else if (screen.name === "hub-browse") {
        renderHubBrowse(root);
      } else if (screen.name === "series-detail") {
        renderSeriesDetail(root);
      } else if (screen.name === "player") {
        dismissTvKeyboard();
        renderPlayer(root, screen.request);
      }
    } catch (error) {
      showFatalError(error);
    }
  }
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  }
  function bootstrap() {
    const el = document.getElementById("app");
    if (!el) {
      document.body.innerHTML = '<pre class="fatal-error">Missing #app root element.</pre>';
      return;
    }
    root = el;
    initFocusRoot(document.body);
    appState.subscribe(scheduleRender);
    document.addEventListener("keydown", (event) => {
      const isBack = event.keyCode === 461 || event.key === "Backspace" || event.key === "Escape" || event.key === "GoBack";
      if (isBack && appState.handleBack()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    window.addEventListener("popstate", () => {
      appState.handleBack();
    });
    if (typeof webOS !== "undefined") {
      document.addEventListener(
        "webOSRelaunch",
        () => {
          void appState.tryAutoLogin();
        },
        false
      );
    }
    void appState.tryAutoLogin();
    scheduleRender();
    window.iptvApp = appState;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
  window.addEventListener("error", (event) => {
    var _a;
    showFatalError((_a = event.error) != null ? _a : event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    showFatalError(event.reason);
  });
})();
//# sourceMappingURL=app.bundle.js.map
