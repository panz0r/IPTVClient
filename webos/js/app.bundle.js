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
  var DEFAULT_FORMATS = ["m3u8", "ts"];
  var PREFERRED_ORDER = ["m3u8", "ts", "mp4", "mkv", "rtmp"];
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

  // src/utils/subtitle-hints.ts
  function isUrlLike(value) {
    return /^https?:\/\//i.test(value) || value.startsWith("/");
  }
  function parseSubtitleHints(value) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (value == null) return [];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          return parseSubtitleHints(JSON.parse(trimmed));
        } catch {
        }
      }
      if (isUrlLike(trimmed)) {
        const label = (_a = trimmed.split("/").pop()) != null ? _a : trimmed;
        return [{ label, url: trimmed }];
      }
      return [{ label: trimmed }];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => parseSubtitleHints(item));
    }
    if (typeof value === "object") {
      const row = value;
      const url = (_e = (_d = (_c = (_b = row.url) != null ? _b : row.path) != null ? _c : row.file) != null ? _d : row.src) != null ? _e : row.link;
      const labelRaw = (_i = (_h = (_g = (_f = row.lang) != null ? _f : row.language) != null ? _g : row.name) != null ? _h : row.title) != null ? _i : row.label;
      const urlStr = url != null ? String(url).trim() : "";
      const labelStr = labelRaw != null ? String(labelRaw).trim() : "";
      if (urlStr) {
        return [{ label: labelStr || urlStr.split("/").pop() || "Subtitle", url: urlStr }];
      }
      if (labelStr) return [{ label: labelStr }];
    }
    return [];
  }
  function subtitleHintsToLanguages(hints) {
    const values = [];
    for (const hint of hints) {
      if (hint.url) values.push(hint.url);
      values.push(hint.label);
    }
    return values.filter((v, i, arr) => v && arr.indexOf(v) === i);
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
        plot: strOrNull(infoRaw.plot),
        subtitles: subtitleHintsToLanguages(parseSubtitleHints(infoRaw.subtitles))
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
      directSource: strOrNull(r.direct_source),
      subtitles: subtitleHintsToLanguages(parseSubtitleHints(r.subtitles))
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
      seriesTitle: entry.seriesTitle,
      subtitleLanguages: []
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

  // src/utils/hub-row-nav.ts
  var HUB_ROW_INITIAL_VISIBLE = 12;
  var HUB_ROW_LOAD_STEP = 8;
  var pendingHubRowFocusKey = null;
  function consumePendingHubRowFocusKey() {
    const key = pendingHubRowFocusKey;
    pendingHubRowFocusKey = null;
    return key;
  }
  function scrollPosterIntoView(poster) {
    const row = poster.closest(".horizontal-poster-row");
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const elRect = poster.getBoundingClientRect();
    const margin = 24;
    if (elRect.right > rowRect.right - margin) {
      row.scrollLeft += elRect.right - rowRect.right + margin;
    } else if (elRect.left < rowRect.left + margin) {
      row.scrollLeft -= rowRect.left - elRect.left + margin;
    }
  }
  function tryExpandHubRowFromPoster(poster) {
    if (appState.screen.name !== "home") return false;
    const tab = appState.screen.tab;
    if (tab !== "movies" && tab !== "series") return false;
    const section = poster.closest(".hub-row[data-row-id]");
    if (!section) return false;
    const rowId = section.dataset.rowId;
    if (!rowId) return false;
    const rowEl = poster.closest(".horizontal-poster-row");
    if (!rowEl) return false;
    const items = Array.from(rowEl.querySelectorAll(".poster-card"));
    const idx = items.indexOf(poster);
    if (idx < 0 || idx !== items.length - 1) return false;
    const focusKey = appState.expandHubRow(rowId, tab);
    if (!focusKey) return false;
    pendingHubRowFocusKey = focusKey;
    return true;
  }
  function hubRowPosterSlice(rowId, items) {
    const count = appState.getHubRowVisibleCount(rowId);
    return items.slice(0, count);
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
      /** Visible poster count per hub genre row (key = row id). */
      this.hubRowVisibleCount = {};
      this.listeners = /* @__PURE__ */ new Set();
      this.genreNotifyTimer = null;
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
    shouldRefreshHubUi() {
      const name = this.screen.name;
      return name === "home" || name === "hub-browse";
    }
    scheduleGenreHubNotify() {
      if (!this.shouldRefreshHubUi()) return;
      if (this.genreNotifyTimer) return;
      this.genreNotifyTimer = setTimeout(() => {
        this.genreNotifyTimer = null;
        if (this.shouldRefreshHubUi()) {
          this.notify();
        }
      }, 1500);
    }
    flushGenreHubNotify() {
      if (this.genreNotifyTimer) {
        clearTimeout(this.genreNotifyTimer);
        this.genreNotifyTimer = null;
      }
      if (this.shouldRefreshHubUi()) {
        this.notify();
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
      if (this.genreNotifyTimer) {
        clearTimeout(this.genreNotifyTimer);
        this.genreNotifyTimer = null;
      }
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
      this.hubRowVisibleCount = {};
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
          setTimeout(() => {
            if (generation === this.vodGenreIndexGeneration) {
              void this.indexVodGenresInBackground(generation);
            }
          }, 3e3);
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
        genreFor: (m) => this.genreForMovie(m),
        maxRows: 20,
        minItemsPerRow: 3
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
      if (this.shouldRefreshHubUi()) {
        this.notify();
      }
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
          this.scheduleGenreHubNotify();
        }
      });
      if (generation !== this.vodGenreIndexGeneration) return;
      this.vodLoadingGenres = false;
      this.rebuildVodHubRows();
      this.flushGenreHubNotify();
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
      this.hubRowVisibleCount = {};
      this.notify();
      try {
        this.seriesAllItems = await this.api.getSeries();
        this.seriesHubRows = groupByGenre({
          items: this.seriesAllItems,
          genreFor: (s) => s.genre,
          maxRows: 20,
          minItemsPerRow: 3
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
    getHubRowVisibleCount(rowId) {
      var _a;
      return (_a = this.hubRowVisibleCount[rowId]) != null ? _a : HUB_ROW_INITIAL_VISIBLE;
    }
    /** Load more posters in a hub row; returns focus key for the first newly revealed title. */
    expandHubRow(rowId, tab) {
      const row = tab === "movies" ? this.vodHubRow(rowId) : this.seriesHubRow(rowId);
      if (!row) return null;
      const prevCount = this.getHubRowVisibleCount(rowId);
      if (prevCount >= row.items.length) return null;
      const nextCount = Math.min(prevCount + HUB_ROW_LOAD_STEP, row.items.length);
      this.hubRowVisibleCount[rowId] = nextCount;
      const nextItem = row.items[prevCount];
      const focusKey = tab === "movies" ? `${rowId}:${nextItem.streamId}` : `${rowId}:${nextItem.seriesId}`;
      this.notify();
      return focusKey;
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
      this.hubRowVisibleCount = {};
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
  var ignoreSearchBlur = false;
  function runWithSearchBlurSuppressed(run) {
    ignoreSearchBlur = true;
    try {
      run();
    } finally {
      ignoreSearchBlur = false;
    }
  }
  function captureSearchEditorState(root2) {
    var _a;
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement)) return null;
    if (!el.classList.contains("search-field__input")) return null;
    if (!root2.contains(el)) return null;
    const wrap = el.closest(".search-field-wrap");
    if (!(wrap == null ? void 0 : wrap.classList.contains("search-field-wrap--editing"))) return null;
    return {
      inputId: el.id,
      cursorPos: (_a = el.selectionStart) != null ? _a : el.value.length
    };
  }
  function reopenSearchEditor(root2, snapshot) {
    const input = root2.querySelector(`#${cssEscape(snapshot.inputId)}`);
    if (!input) return;
    for (const btn of root2.querySelectorAll(".search-field--tv")) {
      if (btn.dataset.searchInput !== snapshot.inputId) continue;
      const wrap = btn.closest(".search-field-wrap");
      if (!wrap) return;
      openSearchEditor(wrap, btn, input, snapshot.cursorPos);
      return;
    }
  }
  function bindTvSearchFields(root2) {
    for (const btn of root2.querySelectorAll(
      ".search-field--tv:not([data-tv-search-bound])"
    )) {
      const inputId = btn.dataset.searchInput;
      if (!inputId) continue;
      const wrap = btn.closest(".search-field-wrap");
      const input = root2.querySelector(`#${cssEscape(inputId)}`);
      if (!wrap || !input) continue;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openSearchEditor(wrap, btn, input);
      });
      btn.dataset.tvSearchBound = "true";
      input.addEventListener("blur", () => {
        if (ignoreSearchBlur) return;
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
  function openSearchEditor(wrap, btn, input, cursorPos) {
    wrap.classList.add("search-field-wrap--editing");
    input.removeAttribute("readonly");
    input.setAttribute("tabindex", "0");
    input.focus();
    try {
      const pos = cursorPos != null ? cursorPos : input.value.length;
      input.setSelectionRange(pos, pos);
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
  var focusCache = null;
  var focusCacheGeneration = 0;
  function invalidateFocusCache() {
    focusCacheGeneration += 1;
    focusCache = null;
  }
  function initFocusRoot(root2) {
    const onKeyDown = (event) => {
      if (root2.querySelector(".player-screen")) {
        return;
      }
      const key = event.key;
      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        const current = document.activeElement;
        const next = findNextFocusable(root2, current, key);
        if (next) {
          event.preventDefault();
          next.focus();
          if (next.classList.contains("poster-card")) {
            scrollPosterIntoView(next);
          }
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
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const sibling = pickHorizontalRowSibling(
        current,
        key === "ArrowLeft" ? "prev" : "next"
      );
      if (sibling) {
        scrollPosterIntoView(sibling);
        return sibling;
      }
      if (key === "ArrowRight" && tryExpandHubRowFromPoster(current)) {
        return null;
      }
      if (current.closest(".horizontal-poster-row")) return null;
    }
    const next = pickDirectional(current, pool, key);
    if (!next && (key === "ArrowUp" || key === "ArrowDown")) {
      return pickCrossZone(current, all, key);
    }
    if (!next && (key === "ArrowLeft" || key === "ArrowRight")) {
      return pickEdgeFallback(current, all, key);
    }
    return next;
  }
  function pickHorizontalRowSibling(current, direction) {
    var _a;
    const row = current.closest(".horizontal-poster-row");
    if (!row) return null;
    const items = Array.from(
      row.querySelectorAll('.poster-card.focusable, .focusable[tabindex="0"]')
    ).filter((el) => el.classList.contains("poster-card"));
    const idx = items.indexOf(current);
    if (idx < 0) return null;
    const nextIdx = direction === "prev" ? idx - 1 : idx + 1;
    return (_a = items[nextIdx]) != null ? _a : null;
  }
  function buildPool(all, current, key) {
    const horizontalRow = current.closest(".horizontal-poster-row");
    if (horizontalRow && (key === "ArrowLeft" || key === "ArrowRight")) {
      return all.filter((el) => horizontalRow.contains(el));
    }
    const sub = subZone(current);
    if (sub === "hub-search") {
      if (key === "ArrowDown") {
        return all.filter((el) => {
          const z = subZone(el);
          return z === "hub" || z === "catalog";
        });
      }
      return all.filter((el) => subZone(el) === "hub-search");
    }
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
      if (sub === "hub" || sub === "catalog") {
        const searchPool = all.filter((el) => subZone(el) === "hub-search");
        if (searchPool.length > 0 && subZone(current) !== "hub-search") {
          const searchTarget = nearestByVertical(current, searchPool, "up");
          if (searchTarget) return searchTarget;
        }
      }
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
      const score = dy * 1e3 + dx;
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
    if (el.closest(".hub-search-bar") || el.closest(".catalog-search-bar")) {
      return "hub-search";
    }
    if (el.closest(".category-sidebar")) return "sidebar";
    if (el.closest(".content-panel")) return "catalog";
    if (el.closest(".hub-scroll")) return "hub";
    if (zone === "content") return "content";
    return topZone(el);
  }
  function visibleFocusables(root2) {
    if (focusCache && focusCache.root === root2 && focusCache.generation === focusCacheGeneration) {
      return focusCache.list;
    }
    const list = Array.from(root2.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    focusCache = { root: root2, list, generation: focusCacheGeneration };
    return list;
  }
  function pickDefaultFocus(root2, all) {
    var _a;
    const content = root2.querySelector(
      '[data-focus-zone="content"], [data-focus-zone="catalog"], [data-focus-zone="hub"], [data-focus-zone="sidebar"]'
    );
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
  function captureFocus(root2) {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !root2.contains(el)) return null;
    if (el.id) return `id:${el.id}`;
    const attrs = [
      "data-focus-key",
      "data-stream-id",
      "data-category-id",
      "data-tab",
      "data-series-id",
      "data-see-all",
      "data-episode-id",
      "data-resume-key",
      "data-search-input"
    ];
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (value) return `${attr}:${value}`;
    }
    return null;
  }
  function restoreFocus(root2, token) {
    if (!token) {
      focusFirst(root2);
      return;
    }
    const colon = token.indexOf(":");
    if (colon < 0) {
      focusFirst(root2);
      return;
    }
    const type = token.slice(0, colon);
    const value = token.slice(colon + 1);
    let el = null;
    if (type === "id") {
      el = root2.querySelector(`#${cssEscape2(value)}`);
    } else {
      el = root2.querySelector(`[${type}="${cssEscapeAttr(value)}"]`);
    }
    if (el) {
      el.focus();
      return;
    }
    focusFirst(root2);
  }
  function cssEscape2(value) {
    if (typeof CSS !== "undefined" && "escape" in CSS) {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function cssEscapeAttr(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  var lastHomeAccountSummary;
  function renderHome(root2) {
    if (appState.screen.name !== "home") {
      lastHomeAccountSummary = void 0;
      return;
    }
    const tab = appState.screen.tab;
    const accountSummary = appState.accountStatus ? accountSuccessSummary(appState.accountStatus) : null;
    const shell = root2.querySelector(".home-screen");
    if (!shell || lastHomeAccountSummary !== accountSummary) {
      root2.innerHTML = buildHomeShellHtml(tab, accountSummary);
      bindHomeShellEvents(root2);
      lastHomeAccountSummary = accountSummary;
    } else {
      updateBottomNavActive(root2, tab);
    }
    const main = root2.querySelector("#home-main");
    bindHomeMainDelegation(main);
    const searchEditor = captureSearchEditorState(root2);
    const focusToken = searchEditor ? null : captureFocus(root2);
    runWithSearchBlurSuppressed(() => {
      if (tab === "live") {
        renderLiveTab(main);
      } else if (tab === "movies") {
        renderMoviesTab(main);
      } else {
        renderSeriesTab(main);
      }
    });
    bindTvSearchFields(main);
    const pendingRowFocus = consumePendingHubRowFocusKey();
    if (pendingRowFocus) {
      const el = findByFocusKey(main, pendingRowFocus);
      if (el) {
        el.focus();
        scrollPosterIntoView(el);
      }
    } else if (searchEditor) {
      reopenSearchEditor(main, searchEditor);
    } else {
      restoreFocus(root2, focusToken);
    }
  }
  function findByFocusKey(container, focusKey) {
    for (const el of container.querySelectorAll("[data-focus-key]")) {
      if (el.dataset.focusKey === focusKey) return el;
    }
    return null;
  }
  function buildHomeShellHtml(tab, accountSummary) {
    return `
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
  }
  function bindHomeShellEvents(root2) {
    bindActivate(root2.querySelector("#logout-btn"), () => {
      appState.logout();
    });
    for (const btn of root2.querySelectorAll("[data-tab]")) {
      bindActivate(btn, () => {
        appState.setTab(btn.dataset.tab);
      });
    }
  }
  function updateBottomNavActive(root2, tab) {
    for (const btn of root2.querySelectorAll("[data-tab]")) {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("nav-item--active", isActive);
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    }
  }
  function bindHomeMainDelegation(main) {
    if (main.dataset.delegateBound === "1") return;
    main.dataset.delegateBound = "1";
    main.addEventListener("click", (event) => {
      handleHomeMainActivate(event.target, false);
    });
    main.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const code = event.keyCode;
      if (code !== 13 && code !== 28 && event.key !== "Enter") return;
      if (handleHomeMainActivate(event.target, true)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    main.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("search-field__input")) {
        return;
      }
      const key = input.id;
      if (!key) return;
      const existing = debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        key,
        setTimeout(() => {
          debounceTimers.delete(key);
          if (key === "live-search") void appState.setLiveSearch(input.value);
          else if (key === "vod-search") appState.setVodSearch(input.value);
          else if (key === "series-search") appState.setSeriesSearch(input.value);
        }, SEARCH_DEBOUNCE_MS)
      );
    });
  }
  function handleHomeMainActivate(target, fromKey) {
    var _a, _b, _c, _d, _e;
    if (!(target instanceof Element)) return false;
    const retry = target.closest('[id^="retry-"]');
    if (retry) {
      if (retry.id === "retry-live") void appState.loadLive();
      else if (retry.id === "retry-vod") void appState.loadMovies();
      else if (retry.id === "retry-series") void appState.loadSeriesList();
      return true;
    }
    const category = target.closest("[data-category-id]");
    if (category) {
      const id = category.dataset.categoryId;
      const cat = appState.liveCategories.find((c) => c.categoryId === id);
      if (cat) void appState.selectLiveCategory(cat);
      return true;
    }
    const liveTile = target.closest('[data-stream-id][data-kind="live"]');
    if (liveTile) {
      const streamId = parseInt((_a = liveTile.dataset.streamId) != null ? _a : "0", 10);
      const item = appState.filteredLiveItems().find((i) => i.streamId === streamId);
      const req = item ? livePlaybackRequest(item) : null;
      if (req) appState.openPlayer(req);
      return true;
    }
    const vodTile = target.closest('[data-stream-id][data-kind="vod"]');
    if (vodTile) {
      const streamId = parseInt((_b = vodTile.dataset.streamId) != null ? _b : "0", 10);
      const item = (_c = appState.filteredVodItems().find((i) => i.streamId === streamId)) != null ? _c : findVodItem(streamId);
      if (item) {
        const req = vodPlaybackRequest(item);
        if (req) appState.openPlayer(req);
      }
      return true;
    }
    const seriesTile = target.closest("[data-series-id]");
    if (seriesTile) {
      const seriesId = parseInt((_d = seriesTile.dataset.seriesId) != null ? _d : "0", 10);
      const series = (_e = appState.filteredSeriesItems().find((i) => i.seriesId === seriesId)) != null ? _e : findSeriesItem(seriesId);
      if (series) appState.openSeriesDetail(series);
      return true;
    }
    const seeAll = target.closest("[data-see-all]");
    if (seeAll) {
      const rowId = seeAll.dataset.seeAll;
      const tab = appState.screen.name === "home" ? appState.screen.tab : "movies";
      if (tab === "movies" || tab === "series") appState.openHubBrowse(tab, rowId);
      return true;
    }
    const resume = target.closest("[data-resume-key]");
    if (resume && appState.accountKey) {
      const key = resume.dataset.resumeKey;
      const entry = loadHistory(appState.accountKey).find((h) => h.contentKey === key);
      if (entry) appState.openPlayer(entryToPlaybackRequest(entry));
      return true;
    }
    return fromKey;
  }
  function bindAppScreenDelegation(appRoot) {
    if (appRoot.dataset.appDelegateBound === "1") return;
    appRoot.dataset.appDelegateBound = "1";
    appRoot.addEventListener("click", (event) => {
      handleAppScreenActivate(event.target);
    });
    appRoot.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const code = event.keyCode;
      if (code !== 13 && code !== 28 && event.key !== "Enter") return;
      if (handleAppScreenActivate(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  function handleAppScreenActivate(target) {
    var _a, _b, _c, _d, _e;
    if (!(target instanceof Element)) return false;
    const hubBack = target.closest("#hub-back");
    if (hubBack && appState.screen.name === "hub-browse") {
      appState.goHome(appState.screen.tab);
      return true;
    }
    const seriesBack = target.closest("#back-series");
    if (seriesBack) {
      appState.goHome("series");
      return true;
    }
    const retryDetail = target.closest("#retry-series-detail");
    if (retryDetail && appState.screen.name === "series-detail") {
      void appState.loadSeriesDetail(appState.screen.series);
      return true;
    }
    if (appState.screen.name === "hub-browse") {
      const { tab, rowId } = appState.screen;
      const row = tab === "movies" ? appState.vodHubRow(rowId) : appState.seriesHubRow(rowId);
      if (!row) return false;
      const vodTile = target.closest('[data-stream-id][data-kind="vod"]');
      if (vodTile && tab === "movies") {
        const streamId = parseInt((_a = vodTile.dataset.streamId) != null ? _a : "0", 10);
        const item = row.items.find((i) => i.streamId === streamId);
        if (item) {
          const req = vodPlaybackRequest(item);
          if (req) appState.openPlayer(req);
        }
        return true;
      }
      const seriesTile = target.closest("[data-series-id]");
      if (seriesTile && tab === "series") {
        const seriesId = parseInt((_b = seriesTile.dataset.seriesId) != null ? _b : "0", 10);
        const series = row.items.find((i) => i.seriesId === seriesId);
        if (series) appState.openSeriesDetail(series);
        return true;
      }
    }
    if (appState.screen.name === "series-detail" && appState.seriesDetail) {
      const episodeBtn = target.closest("[data-episode-id]");
      if (episodeBtn && appState.api) {
        const series = appState.screen.series;
        const episodeId = parseInt((_c = episodeBtn.dataset.episodeId) != null ? _c : "0", 10);
        const season = (_d = episodeBtn.dataset.season) != null ? _d : "";
        const ep = (_e = appState.seriesDetail.episodes[season]) == null ? void 0 : _e.find((e) => e.id === episodeId);
        if (ep) {
          const req = {
            title: `${series.name} \xB7 ${ep.title}`,
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
            seriesTitle: series.name,
            subtitleLanguages: ep.subtitles
          };
          appState.openPlayer(req);
        }
        return true;
      }
    }
    return false;
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
      focusFirst(root2);
      return;
    }
    const visibleItems = row.items.slice(0, MAX_GRID_ITEMS);
    const posters = tab === "movies" ? visibleItems.map((item) => moviePoster(item, `${rowId}:${item.streamId}`)).join("") : visibleItems.map((item) => seriesPoster(item, `${rowId}:${item.seriesId}`)).join("");
    const focusToken = captureFocus(root2);
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
    restoreFocus(root2, focusToken);
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
    const focusToken = captureFocus(root2);
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
    restoreFocus(root2, focusToken);
  }
  function renderLiveTab(main) {
    if (appState.liveLoading && appState.liveCategories.length === 0) {
      main.innerHTML = loadingStateHtml("Loading categories\u2026");
      return;
    }
    if (appState.liveError) {
      main.innerHTML = errorStateHtml(appState.liveError, "retry-live");
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
        <div class="catalog-search-bar" data-focus-zone="hub-search">
          ${hubSearchField("live-search", "Search channels\u2026", appState.liveSearchQuery)}
        </div>
        <div class="catalog-scroll">
        ${appState.liveLoading ? loadingStateHtml("Loading channels\u2026") : items.length === 0 ? emptyStateHtml("No channels in this category.") : `<div class="live-grid" id="live-grid">
                  ${items.slice(0, MAX_GRID_ITEMS).map(
      (item) => contentTileHtml({
        title: item.name,
        imageUrl: item.streamIcon,
        attrs: `data-stream-id="${item.streamId}" data-kind="live"`
      })
    ).join("")}
                </div>`}
        </div>
      </section>
    </div>
  `;
  }
  function renderMoviesTab(main) {
    if (appState.vodLoading && appState.vodHubRows.length === 0) {
      main.innerHTML = loadingStateHtml("Loading catalog\u2026");
      return;
    }
    if (appState.vodError) {
      main.innerHTML = errorStateHtml(appState.vodError, "retry-vod");
      return;
    }
    const isSearching = appState.vodSearchQuery.trim().length > 0;
    main.innerHTML = `
    <div class="hub-layout" data-focus-zone="hub">
      <div class="hub-search-bar" data-focus-zone="hub-search">
        ${hubSearchField("vod-search", "Search movies by title or genre\u2026", appState.vodSearchQuery)}
      </div>
      <div class="hub-scroll">
      ${isSearching ? renderMoviesSearchResults() : renderMoviesHubBrowse()}
      </div>
    </div>
  `;
  }
  function renderSeriesTab(main) {
    if (appState.seriesLoading && appState.seriesHubRows.length === 0) {
      main.innerHTML = loadingStateHtml("Loading catalog\u2026");
      return;
    }
    if (appState.seriesError) {
      main.innerHTML = errorStateHtml(appState.seriesError, "retry-series");
      return;
    }
    const isSearching = appState.seriesSearchQuery.trim().length > 0;
    main.innerHTML = `
    <div class="hub-layout" data-focus-zone="hub">
      <div class="hub-search-bar" data-focus-zone="hub-search">
        ${hubSearchField("series-search", "Search series by title, cast, or genre\u2026", appState.seriesSearchQuery)}
      </div>
      <div class="hub-scroll">
      ${isSearching ? renderSeriesSearchResults() : renderSeriesHubBrowse()}
      </div>
    </div>
  `;
  }
  function renderMoviesSearchResults() {
    const items = appState.filteredVodItems().slice(0, MAX_GRID_ITEMS);
    if (items.length === 0) {
      return emptyStateHtml("No movies match your search.");
    }
    return `<div class="hub-search-grid">
    ${items.map((item) => moviePoster(item, `search:vod:${item.streamId}`)).join("")}
  </div>`;
  }
  function renderSeriesSearchResults() {
    const items = appState.filteredSeriesItems().slice(0, MAX_GRID_ITEMS);
    if (items.length === 0) {
      return emptyStateHtml("No series match your search.");
    }
    return `<div class="hub-search-grid">
    ${items.map((item) => seriesPoster(item, `search:series:${item.seriesId}`)).join("")}
  </div>`;
  }
  function renderMoviesHubBrowse() {
    const history = recentlyWatchedEntries("vod");
    const rowsHtml = appState.vodHubRows.map(
      (row) => hubRowHtml(
        row.title,
        row.id,
        hubRowPosterSlice(row.id, row.items).map((item) => moviePoster(item, `${row.id}:${item.streamId}`)).join(""),
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
        hubRowPosterSlice(row.id, row.items).map((item) => seriesPoster(item, `${row.id}:${item.seriesId}`)).join(""),
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
        attrs: `data-focus-key="recent:${escapeAttr(entry.contentKey)}" data-resume-key="${escapeAttr(entry.contentKey)}"`
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
  function moviePoster(item, focusKey) {
    const key = focusKey != null ? focusKey : `vod:${item.streamId}`;
    return posterCardHtml({
      title: item.name,
      imageUrl: item.streamIcon,
      placeholderIcon: "\u{1F3AC}",
      attrs: `data-focus-key="${escapeAttr(key)}" data-stream-id="${item.streamId}" data-kind="vod"`
    });
  }
  function seriesPoster(item, focusKey) {
    const key = focusKey != null ? focusKey : `series:${item.seriesId}`;
    return posterCardHtml({
      title: item.name,
      imageUrl: item.cover,
      placeholderIcon: "\u{1F4FA}",
      attrs: `data-focus-key="${escapeAttr(key)}" data-series-id="${item.seriesId}"`
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
      seriesTitle: null,
      subtitleLanguages: []
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
      seriesTitle: null,
      subtitleLanguages: []
    };
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

  // src/services/subtitle-parser.ts
  function parseTimestamp(value) {
    const cleaned = value.trim().replace(",", ".");
    const parts = cleaned.split(":");
    if (parts.length === 3) {
      const [h, m, rest] = parts;
      const [s, ms = "0"] = rest.split(".");
      return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms.padEnd(3, "0").slice(0, 3), 10) / 1e3;
    }
    if (parts.length === 2) {
      const [m, rest] = parts;
      const [s, ms = "0"] = rest.split(".");
      return parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms.padEnd(3, "0").slice(0, 3), 10) / 1e3;
    }
    return 0;
  }
  function parseSubtitleContent(content, url) {
    const trimmed = content.trim();
    if (trimmed.startsWith("WEBVTT") || url.toLowerCase().includes(".vtt")) {
      return parseVtt(trimmed);
    }
    return parseSrt(trimmed);
  }
  function parseSrt(content) {
    const cues = [];
    const normalized = content.replace(/\r/g, "").trim();
    const blocks = normalized.split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 2) continue;
      const timeLine = lines.find((l) => l.includes("-->"));
      if (!timeLine) continue;
      const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
      const textStart = lines.indexOf(timeLine) + 1;
      const text = lines.slice(textStart).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\.*?\}/g, "").trim();
      if (!text) continue;
      const start = parseTimestamp(startStr);
      const end = parseTimestamp(endStr);
      if (end <= start) continue;
      cues.push({ start, end, text });
    }
    return cues;
  }
  function parseVtt(content) {
    const cues = [];
    const body = content.replace(/^WEBVTT[^\n]*\n/i, "");
    const blocks = body.replace(/\r/g, "").split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.split("\n");
      const timeLine = lines.find((l) => l.includes("-->"));
      if (!timeLine) continue;
      const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim().split(" ")[0]);
      const textStart = lines.indexOf(timeLine) + 1;
      const text = lines.slice(textStart).join("\n").replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      cues.push({
        start: parseTimestamp(startStr),
        end: parseTimestamp(endStr),
        text
      });
    }
    return cues;
  }

  // src/services/subtitle-loader.ts
  var MAX_BYTES = 4 * 1024 * 1024;
  function resolveUrl(base, relative) {
    if (/^https?:\/\//i.test(relative)) return relative;
    if (relative.startsWith("/")) {
      return `${new URL(base).origin}${relative}`;
    }
    return new URL(relative, base).href;
  }
  function isM3u8(content, url) {
    const trimmed = content.trim();
    return trimmed.startsWith("#EXTM3U") || url.toLowerCase().includes(".m3u8") || trimmed.includes("#EXT-X-TARGETDURATION");
  }
  async function fetchText(url) {
    try {
      const response = await iptvFetch(url);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) return null;
      return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
    } catch {
      return null;
    }
  }
  function parseHlsWebVttPlaylist(text, playlistUrl) {
    const lines = text.replace(/\r/g, "").split("\n");
    const segments = [];
    let pendingDuration = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXTINF:")) {
        const match = line.match(/#EXTINF:([0-9.]+)/);
        pendingDuration = match ? parseFloat(match[1]) : 0;
        continue;
      }
      if (!line || line.startsWith("#")) continue;
      segments.push({ url: resolveUrl(playlistUrl, line), duration: pendingDuration });
      pendingDuration = 0;
    }
    return segments;
  }
  async function loadHlsWebVttCues(playlistUrl) {
    const playlistText = await fetchText(playlistUrl);
    if (!playlistText) return [];
    if (!isM3u8(playlistText, playlistUrl)) {
      return parseSubtitleContent(playlistText, playlistUrl);
    }
    const segments = parseHlsWebVttPlaylist(playlistText, playlistUrl);
    if (segments.length === 0) return [];
    const cues = [];
    let offset = 0;
    for (const segment of segments) {
      const segmentText = await fetchText(segment.url);
      if (segmentText) {
        const segmentCues = parseSubtitleContent(segmentText, segment.url);
        for (const cue of segmentCues) {
          cues.push({
            start: cue.start + offset,
            end: cue.end + offset,
            text: cue.text
          });
        }
      }
      offset += segment.duration;
    }
    return cues;
  }
  async function loadSubtitleCues(url, baseUrl) {
    const resolved = baseUrl ? resolveUrl(baseUrl, url) : url;
    const text = await fetchText(resolved);
    if (!text) return [];
    if (isM3u8(text, resolved)) {
      return loadHlsWebVttCues(resolved);
    }
    return parseSubtitleContent(text, resolved);
  }
  async function validateSubtitleUrl(url, baseUrl) {
    const cues = await loadSubtitleCues(url, baseUrl);
    return cues.length > 0 ? cues : [];
  }

  // src/services/subtitle-resolver.ts
  function langVariants(lang) {
    var _a;
    const raw = lang.trim();
    if (!raw) return [];
    const lower = raw.toLowerCase();
    const variants = /* @__PURE__ */ new Set([lower, raw]);
    const map = {
      english: ["en", "eng", "english"],
      en: ["en", "eng", "english"],
      swedish: ["sv", "swe", "swedish"],
      sv: ["sv", "swe", "swedish"],
      german: ["de", "deu", "ger", "german"],
      de: ["de", "deu", "ger", "german"],
      french: ["fr", "fre", "fra", "french"],
      fr: ["fr", "fre", "fra", "french"],
      spanish: ["es", "spa", "spanish"],
      es: ["es", "spa", "spanish"],
      norwegian: ["no", "nor", "nb", "norwegian"],
      no: ["no", "nor", "nb", "norwegian"]
    };
    for (const v of (_a = map[lower]) != null ? _a : []) variants.add(v);
    return [...variants];
  }
  function isUrlLike2(value) {
    return /^https?:\/\//i.test(value) || value.startsWith("/");
  }
  function resolveUrl2(base, relative) {
    if (/^https?:\/\//i.test(relative)) return relative;
    if (relative.startsWith("/")) {
      const origin = new URL(base).origin;
      return `${origin}${relative}`;
    }
    return new URL(relative, base).href;
  }
  function buildSidecarCandidates(videoUrl, languageHints) {
    const urls = /* @__PURE__ */ new Set();
    const withoutQuery = videoUrl.split("?")[0];
    const base = withoutQuery.replace(/\.[a-z0-9]+$/i, "");
    const exts = ["srt", "vtt"];
    for (const ext of exts) {
      urls.add(`${base}.${ext}`);
      urls.add(`${base}.en.${ext}`);
      urls.add(`${base}.eng.${ext}`);
    }
    for (const hint of languageHints) {
      if (isUrlLike2(hint)) {
        urls.add(hint.startsWith("/") ? resolveUrl2(videoUrl, hint) : hint);
        continue;
      }
      for (const variant of langVariants(hint)) {
        for (const ext of exts) {
          urls.add(`${base}.${variant}.${ext}`);
          urls.add(`${base}_${variant}.${ext}`);
          urls.add(`${base}-${variant}.${ext}`);
        }
      }
    }
    return [...urls];
  }
  function labelFromUrl(url, fallback) {
    var _a, _b;
    const filename = (_b = (_a = url.split("/").pop()) == null ? void 0 : _a.split("?")[0]) != null ? _b : url;
    if (/\.(srt|vtt)$/i.test(filename)) {
      const stem = filename.replace(/\.(srt|vtt)$/i, "");
      if (/^\d+$/.test(stem)) return fallback;
      return stem.replace(/[._-]/g, " ").trim() || fallback;
    }
    return fallback;
  }
  async function discoverHlsSubtitleTracks(masterUrl) {
    try {
      const response = await iptvFetch(masterUrl);
      if (!response.ok) return [];
      const text = await response.text();
      const tracks = [];
      for (const line of text.split("\n")) {
        if (!line.includes("TYPE=SUBTITLES")) continue;
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (!uriMatch) continue;
        const nameMatch = line.match(/NAME="([^"]+)"/);
        const langMatch = line.match(/LANGUAGE="([^"]+)"/);
        const label = (nameMatch == null ? void 0 : nameMatch[1]) || (langMatch == null ? void 0 : langMatch[1]) || `Subtitle ${tracks.length + 1}`;
        tracks.push({
          id: `hls:${tracks.length}:${uriMatch[1]}`,
          label,
          url: resolveUrl2(masterUrl, uriMatch[1])
        });
      }
      return tracks;
    } catch {
      return [];
    }
  }
  async function resolveExternalSubtitleTracks(options) {
    var _a;
    const { videoUrl, languageHints, api, vodStreamId } = options;
    const hints = [];
    for (const entry of languageHints) {
      hints.push(...parseSubtitleHints(entry));
    }
    const candidates = [];
    const seenUrls = /* @__PURE__ */ new Set();
    const addCandidate = (url, label, idPrefix) => {
      const resolved = resolveUrl2(videoUrl, url);
      if (seenUrls.has(resolved)) return;
      seenUrls.add(resolved);
      candidates.push({
        id: `${idPrefix}:${candidates.length}`,
        label: labelFromUrl(resolved, label),
        url: resolved
      });
    };
    if (api && vodStreamId != null && options.kind === "vod") {
      try {
        const info = await api.getVodInfo(vodStreamId);
        for (const entry of info.subtitles) {
          hints.push(...parseSubtitleHints(entry));
        }
      } catch {
      }
    }
    for (const hint of hints) {
      if (hint.url) {
        addCandidate(hint.url, hint.label, "api");
      }
    }
    if (videoUrl.toLowerCase().includes(".m3u8")) {
      const hlsTracks = await discoverHlsSubtitleTracks(videoUrl);
      for (const track of hlsTracks) {
        addCandidate(track.url, track.label, "hls");
      }
    }
    for (const url of buildSidecarCandidates(
      videoUrl,
      hints.map((h) => {
        var _a2;
        return (_a2 = h.url) != null ? _a2 : h.label;
      })
    )) {
      addCandidate(url, (_a = url.split("/").pop()) != null ? _a : url, "sidecar");
    }
    const found = [];
    for (const candidate of candidates) {
      const cues = await validateSubtitleUrl(candidate.url, videoUrl);
      if (cues.length > 0) {
        found.push(candidate);
      }
    }
    return found;
  }

  // src/ui/subtitle-overlay.ts
  function mountSubtitleOverlay(screen) {
    const el = document.createElement("div");
    el.className = "player-subtitle-overlay hidden";
    el.innerHTML = '<span class="player-subtitle-text"></span>';
    screen.appendChild(el);
    const textEl = el.querySelector(".player-subtitle-text");
    let cues = [];
    let boundVideo = null;
    let onTimeUpdate = null;
    const update = (video) => {
      const t = video.currentTime;
      const active = cues.find((c) => t >= c.start && t < c.end);
      if (active) {
        textEl.textContent = active.text;
        el.classList.remove("hidden");
      } else {
        textEl.textContent = "";
        el.classList.add("hidden");
      }
    };
    return {
      destroy() {
        el.remove();
      },
      setCues(next) {
        cues = next;
        if (boundVideo) update(boundVideo);
      },
      bindVideo(video) {
        boundVideo = video;
        if (onTimeUpdate) {
          video.removeEventListener("timeupdate", onTimeUpdate);
        }
        onTimeUpdate = () => update(video);
        video.addEventListener("timeupdate", onTimeUpdate);
        update(video);
      },
      syncNow(video) {
        update(video);
      },
      clear() {
        cues = [];
        textEl.textContent = "";
        el.classList.add("hidden");
      }
    };
  }

  // src/ui/player-controls.ts
  var HIDE_AFTER_MS = 4e3;
  var SEEK_STEP_SEC = 10;
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function isOkKey(event) {
    return event.key === "Enter" || event.keyCode === 13 || event.keyCode === 28;
  }
  function arrowDirection(event) {
    const code = event.keyCode;
    if (event.key === "ArrowUp" || code === 38) return "up";
    if (event.key === "ArrowDown" || code === 40) return "down";
    if (event.key === "ArrowLeft" || code === 37) return "left";
    if (event.key === "ArrowRight" || code === 39) return "right";
    return null;
  }
  function isPlayPauseKey(event) {
    return event.keyCode === 415 || event.keyCode === 19 || event.key === "MediaPlayPause";
  }
  function isRewindKey(event) {
    return event.keyCode === 412 || event.key === "MediaRewind";
  }
  function isForwardKey(event) {
    return event.keyCode === 417 || event.key === "MediaFastForward";
  }
  function isSubtitleRemoteKey(event) {
    return event.keyCode === 460 || event.keyCode === 462 || event.key === "Subtitle";
  }
  function buildPlayerChromeHtml(title, isLive) {
    const seekSection = isLive ? "" : `
        <div class="player-seek-section" id="player-seek-section">
          <div class="player-seek-times">
            <span class="player-time" id="player-time-current">0:00</span>
            <span class="player-time" id="player-time-duration">0:00</span>
          </div>
          <div class="player-seek-bar" id="player-seek-bar">
            <div class="player-seek-track">
              <div class="player-seek-fill" id="player-seek-fill"></div>
              <div class="player-seek-thumb" id="player-seek-thumb"></div>
            </div>
          </div>
        </div>`;
    return `
    <video id="player-video" class="player-video" autoplay playsinline preload="auto"></video>
    <div class="player-hit-layer" id="player-hit" tabindex="0"></div>
    <div class="player-chrome player-chrome--visible" id="player-chrome">
      <div class="player-top-bar">
        <button type="button" class="player-back-btn focusable" id="player-back" tabindex="0" aria-label="Back">
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
      </div>
      <div class="player-buffering hidden" id="player-buffering"><div class="spinner"></div></div>
      <div class="player-track-panel hidden" id="player-track-panel">
        <p class="player-track-heading">Subtitles</p>
        <div class="player-track-list" id="player-track-list"></div>
      </div>
      <div class="player-bottom">
        ${seekSection}
        <p class="player-transport-title">${escapeHtml2(title)}</p>
        <div class="player-transport-main">
          <button type="button" class="player-play-btn focusable" id="player-play" tabindex="0" aria-label="Play">
            <svg class="player-icon-play" viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <svg class="player-icon-pause hidden" viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button type="button" class="player-subs-btn focusable player-transport-btn--subs" id="player-subs" tabindex="0" aria-label="Subtitles">
            <svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg>
          </button>
          ${isLive ? '<span class="player-live-badge">LIVE</span>' : ""}
        </div>
      </div>
    </div>
  `;
  }
  function mountPlayerControls(screen, options) {
    const { title, isLive, onBack, subtitleContext } = options;
    screen.innerHTML = buildPlayerChromeHtml(title, isLive);
    const subtitleOverlay = mountSubtitleOverlay(screen);
    subtitleOverlay.bindVideo(screen.querySelector("#player-video"));
    const video = screen.querySelector("#player-video");
    const chrome = screen.querySelector("#player-chrome");
    const hitLayer = screen.querySelector("#player-hit");
    const backBtn = screen.querySelector("#player-back");
    const bufferingEl = screen.querySelector("#player-buffering");
    const trackPanel = screen.querySelector("#player-track-panel");
    const trackList = screen.querySelector("#player-track-list");
    const playBtn = screen.querySelector("#player-play");
    const playIcon = playBtn.querySelector(".player-icon-play");
    const pauseIcon = playBtn.querySelector(".player-icon-pause");
    const subsBtn = screen.querySelector("#player-subs");
    const seekBar = screen.querySelector("#player-seek-bar");
    const seekFill = screen.querySelector("#player-seek-fill");
    const seekThumb = screen.querySelector("#player-seek-thumb");
    const timeCurrent = screen.querySelector("#player-time-current");
    const timeDuration = screen.querySelector("#player-time-duration");
    let visible = true;
    let trackMenuOpen = false;
    let hideTimer = null;
    let seekDragging = false;
    let selectedTrackKey = "off";
    let focusTarget = "play";
    let externalLoadToken = 0;
    let externalTracks = [];
    let externalTracksLoading = false;
    let externalTracksError = null;
    let currentVideoUrl = "";
    const clearHideTimer = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
    };
    const setRemoteFocusEnabled = (enabled) => {
      const candidates = screen.querySelectorAll(
        "#player-back, #player-play, #player-subs, .player-track-option"
      );
      for (const el of candidates) {
        if (el.classList.contains("hidden")) {
          el.tabIndex = -1;
          continue;
        }
        if (el.classList.contains("player-track-option") && !trackMenuOpen) {
          el.tabIndex = -1;
          continue;
        }
        el.tabIndex = enabled ? 0 : -1;
      }
      hitLayer.tabIndex = enabled ? -1 : 0;
      if (enabled) {
        const el = focusTarget === "back" ? backBtn : focusTarget === "subs" ? subsBtn : playBtn;
        el.focus();
      } else {
        hitLayer.focus();
      }
    };
    const refreshRemoteFocus = () => {
      setRemoteFocusEnabled(visible);
    };
    const setChromeVisible = (show) => {
      visible = show;
      chrome.classList.toggle("player-chrome--visible", show);
      chrome.classList.toggle("player-chrome--hidden", !show);
      setRemoteFocusEnabled(show);
      if (!show) {
        trackMenuOpen = false;
        trackPanel.classList.add("hidden");
        subsBtn.classList.remove("player-transport-btn--active");
      }
    };
    const resetHideTimer = () => {
      clearHideTimer();
      if (!visible) return;
      hideTimer = setTimeout(() => setChromeVisible(false), HIDE_AFTER_MS);
    };
    const showControls = (keepMenu = false) => {
      setChromeVisible(true);
      if (!keepMenu) {
        trackMenuOpen = false;
        trackPanel.classList.add("hidden");
        subsBtn.classList.remove("player-transport-btn--active");
      }
      resetHideTimer();
    };
    const onUserInteraction = () => {
      if (!visible) showControls(trackMenuOpen);
      else resetHideTimer();
    };
    const updatePlayIcon = () => {
      const playing = !video.paused && !video.ended;
      playIcon.classList.toggle("hidden", playing);
      pauseIcon.classList.toggle("hidden", !playing);
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    };
    const pauseAndShow = () => {
      if (!video.paused && !video.ended) {
        video.pause();
        updatePlayIcon();
      }
      focusTarget = "play";
      showControls();
    };
    const seekRelative = (deltaSec) => {
      if (isLive || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSec));
      onUserInteraction();
      updateSeekUi();
    };
    const seekToFraction = (fraction) => {
      if (isLive || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const clamped = Math.max(0, Math.min(1, fraction));
      video.currentTime = video.duration * clamped;
      updateSeekUi();
    };
    const updateSeekUi = () => {
      if (!timeCurrent || !timeDuration) return;
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) {
        timeDuration.textContent = "0:00";
        if (seekFill) seekFill.style.width = "0%";
        if (seekThumb) seekThumb.style.left = "0%";
        return;
      }
      const fraction = video.currentTime / dur;
      timeCurrent.textContent = formatTime(video.currentTime);
      timeDuration.textContent = formatTime(dur);
      if (!seekDragging && seekFill && seekThumb) {
        const pct = `${fraction * 100}%`;
        seekFill.style.width = pct;
        seekThumb.style.left = pct;
      }
    };
    const applySubtitleTrack = (trackKey) => {
      selectedTrackKey = trackKey;
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = "hidden";
      }
      subtitleOverlay.clear();
      if (trackKey === "off") {
        renderTrackList();
        return;
      }
      if (!trackKey.startsWith("ext:")) {
        renderTrackList();
        return;
      }
      const id = trackKey.slice(4);
      const track = externalTracks.find((t) => t.id === id);
      if (!track) {
        renderTrackList();
        return;
      }
      void (async () => {
        try {
          const cues = await loadSubtitleCues(track.url, currentVideoUrl || video.src);
          if (selectedTrackKey !== trackKey) return;
          if (cues.length === 0) {
            console.warn(`[subtitles] No cues parsed from ${track.url}`);
            selectedTrackKey = "off";
            renderTrackList();
            return;
          }
          subtitleOverlay.setCues(cues);
          subtitleOverlay.bindVideo(video);
          subtitleOverlay.syncNow(video);
          console.log(`[subtitles] Loaded ${cues.length} cues from ${track.label}`);
          renderTrackList();
        } catch (err) {
          console.warn(`[subtitles] Failed to load ${track.url}:`, err);
          selectedTrackKey = "off";
          renderTrackList();
        }
      })();
      renderTrackList();
    };
    const loadExternalTracks = (videoUrl) => {
      if (!subtitleContext || !videoUrl) return;
      currentVideoUrl = videoUrl;
      const token = ++externalLoadToken;
      externalTracksLoading = true;
      externalTracksError = null;
      externalTracks = [];
      if (selectedTrackKey.startsWith("ext:")) {
        selectedTrackKey = "off";
        subtitleOverlay.clear();
      }
      renderTrackList();
      void (async () => {
        try {
          const tracks = await resolveExternalSubtitleTracks({
            videoUrl,
            kind: subtitleContext.kind,
            languageHints: subtitleContext.languageHints,
            api: subtitleContext.api,
            vodStreamId: subtitleContext.vodStreamId
          });
          if (token !== externalLoadToken || videoUrl !== currentVideoUrl) return;
          externalTracks = tracks;
          if (tracks.length === 0) {
            externalTracksError = "No external subtitle files found for this stream.";
          }
        } catch {
          if (token === externalLoadToken) {
            externalTracksError = "Could not search for subtitles.";
          }
        } finally {
          if (token === externalLoadToken) {
            externalTracksLoading = false;
            renderTrackList();
          }
        }
      })();
    };
    const renderTrackList = () => {
      const items = [
        { label: "Off", key: "off" }
      ];
      for (const track of externalTracks) {
        items.push({ label: track.label, key: `ext:${track.id}` });
      }
      if (externalTracksLoading) {
        items.push({ label: "Searching for subtitles\u2026", key: "loading", disabled: true });
      } else if (externalTracks.length === 0) {
        items.push({
          label: externalTracksError != null ? externalTracksError : "No subtitles found",
          key: "none",
          disabled: true
        });
      }
      subsBtn.classList.remove("hidden");
      trackList.innerHTML = items.map(
        (item) => `<button type="button" class="player-track-option focusable${selectedTrackKey === item.key ? " player-track-option--active" : ""}${item.disabled ? " player-track-option--disabled" : ""}" data-track-key="${item.key}" tabindex="${item.disabled ? "-1" : "0"}"${item.disabled ? " disabled" : ""}>${escapeHtml2(item.label)}</button>`
      ).join("");
      for (const btn of trackList.querySelectorAll(".player-track-option:not([disabled])")) {
        btn.addEventListener("click", () => {
          var _a;
          const key = (_a = btn.dataset.trackKey) != null ? _a : "off";
          if (key === "loading" || key === "none") return;
          applySubtitleTrack(key);
          onUserInteraction();
        });
      }
      if (trackMenuOpen) refreshRemoteFocus();
    };
    const toggleTrackMenu = () => {
      var _a;
      trackMenuOpen = !trackMenuOpen;
      trackPanel.classList.toggle("hidden", !trackMenuOpen);
      subsBtn.classList.toggle("player-transport-btn--active", trackMenuOpen);
      if (trackMenuOpen) {
        showControls(true);
        refreshRemoteFocus();
        (_a = trackList.querySelector(".player-track-option")) == null ? void 0 : _a.focus();
      }
      resetHideTimer();
    };
    const togglePlayPause = () => {
      onUserInteraction();
      if (video.paused || video.ended) void video.play();
      else video.pause();
      updatePlayIcon();
    };
    const focusPrimaryTarget = (target) => {
      focusTarget = target;
      const el = target === "back" ? backBtn : target === "subs" ? subsBtn : playBtn;
      el.focus();
      backBtn.classList.toggle("player-focus-active", target === "back");
      playBtn.classList.toggle("player-focus-active", target === "play");
      subsBtn.classList.toggle("player-focus-active", target === "subs");
    };
    const onPlayerKeyDown = (event) => {
      var _a;
      if (!document.querySelector(".player-screen")) return;
      const current = document.activeElement;
      if (isPlayPauseKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (!visible) pauseAndShow();
        else togglePlayPause();
        return;
      }
      if (isRewindKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        showControls();
        seekRelative(-SEEK_STEP_SEC);
        return;
      }
      if (isForwardKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        showControls();
        seekRelative(SEEK_STEP_SEC);
        return;
      }
      if (isSubtitleRemoteKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        renderTrackList();
        showControls(true);
        if (!trackMenuOpen) toggleTrackMenu();
        focusPrimaryTarget("subs");
        return;
      }
      if (isOkKey(event)) {
        if ((current == null ? void 0 : current.classList.contains("player-track-option")) && !current.disabled) {
          event.preventDefault();
          event.stopPropagation();
          const key = (_a = current.dataset.trackKey) != null ? _a : "off";
          if (key !== "loading" && key !== "none") {
            applySubtitleTrack(key);
            trackMenuOpen = false;
            trackPanel.classList.add("hidden");
            subsBtn.classList.remove("player-transport-btn--active");
            focusPrimaryTarget("subs");
          }
          onUserInteraction();
          return;
        }
        if (current === subsBtn) {
          event.preventDefault();
          event.stopPropagation();
          toggleTrackMenu();
          return;
        }
        if (current === backBtn) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
          return;
        }
        if (current === playBtn && visible) {
          event.preventDefault();
          event.stopPropagation();
          togglePlayPause();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        pauseAndShow();
        return;
      }
      const dir = arrowDirection(event);
      if (dir) {
        event.preventDefault();
        event.stopPropagation();
        if (!visible) {
          showControls();
          if (dir === "left") seekRelative(-SEEK_STEP_SEC);
          if (dir === "right") seekRelative(SEEK_STEP_SEC);
          focusPrimaryTarget("play");
          return;
        }
        onUserInteraction();
        if (trackMenuOpen && (current == null ? void 0 : current.classList.contains("player-track-option"))) {
          if (dir === "up" || dir === "down") {
            const options2 = Array.from(trackList.querySelectorAll(".player-track-option"));
            const idx = options2.indexOf(current);
            const next = dir === "up" ? options2[idx - 1] : options2[idx + 1];
            if (next) next.focus();
            else if (dir === "down") {
              trackMenuOpen = false;
              trackPanel.classList.add("hidden");
              subsBtn.classList.remove("player-transport-btn--active");
              focusPrimaryTarget("play");
            }
          }
          return;
        }
        if (dir === "left") {
          seekRelative(-SEEK_STEP_SEC);
          return;
        }
        if (dir === "right") {
          seekRelative(SEEK_STEP_SEC);
          return;
        }
        if (dir === "up") {
          if (current === subsBtn) focusPrimaryTarget("play");
          else if (current === playBtn) focusPrimaryTarget("back");
          else focusPrimaryTarget("back");
          return;
        }
        if (dir === "down") {
          if (current === backBtn) focusPrimaryTarget("play");
          else if (current === playBtn) focusPrimaryTarget("subs");
          else focusPrimaryTarget("subs");
        }
      }
    };
    document.addEventListener("keydown", onPlayerKeyDown, true);
    backBtn.addEventListener("click", onBack);
    playBtn.addEventListener("click", togglePlayPause);
    subsBtn.addEventListener("click", toggleTrackMenu);
    hitLayer.addEventListener("click", () => {
      if (visible) togglePlayPause();
      else pauseAndShow();
    });
    hitLayer.addEventListener("mousemove", onUserInteraction);
    if (seekBar && seekFill && seekThumb) {
      const seekFromClientX = (clientX) => {
        const rect = seekBar.getBoundingClientRect();
        if (rect.width <= 0) return;
        seekToFraction((clientX - rect.left) / rect.width);
      };
      seekBar.addEventListener("mousedown", (event) => {
        seekDragging = true;
        onUserInteraction();
        seekFromClientX(event.clientX);
      });
      document.addEventListener("mousemove", (event) => {
        if (!seekDragging) return;
        seekFromClientX(event.clientX);
      });
      document.addEventListener("mouseup", () => {
        if (!seekDragging) return;
        seekDragging = false;
        onUserInteraction();
      });
    }
    const onTimeUpdate = () => updateSeekUi();
    const onPlayState = () => updatePlayIcon();
    const onLoadedMetadata = () => updateSeekUi();
    const onCanPlay = () => {
      if (video.src) loadExternalTracks(video.src);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlayState);
    video.addEventListener("pause", onPlayState);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    showControls();
    focusPrimaryTarget("play");
    return {
      destroy() {
        clearHideTimer();
        document.removeEventListener("keydown", onPlayerKeyDown, true);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("play", onPlayState);
        video.removeEventListener("pause", onPlayState);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        subtitleOverlay.destroy();
      },
      getVideoElement() {
        return video;
      },
      setBuffering(buffering) {
        bufferingEl.classList.toggle("hidden", !buffering);
      },
      showControls() {
        showControls();
      },
      setVideoUrl(url) {
        loadExternalTracks(url);
      }
    };
  }

  // src/services/stream-probe.ts
  function isReachableStatus(code) {
    return code === 200 || code === 206 || code === 301 || code === 302 || code === 307 || code === 308;
  }
  async function probeStreamUrl(url) {
    const log = [`--- Probe: ${url} ---`];
    for (const method of ["HEAD", "GET"]) {
      try {
        const init = method === "GET" ? { method: "GET", headers: { Range: "bytes=0-4095" } } : { method: "HEAD" };
        const started = Date.now();
        const response = await iptvFetch(url, init);
        const ms = Date.now() - started;
        log.push(`${method} ${response.status} (${ms}ms)`);
        const ct = response.headers.get("content-type");
        if (ct) log.push(`Content-Type: ${ct}`);
        if (isReachableStatus(response.status)) {
          return { url, reachable: true, statusCode: response.status, log: log.join("\n") };
        }
      } catch (e) {
        log.push(`${method} error: ${String(e)}`);
      }
    }
    return { url, reachable: false, statusCode: null, log: log.join("\n") };
  }
  async function probeBestStreamIndex(urls, appendLog) {
    appendLog("Probing stream URLs\u2026");
    for (let i = 0; i < urls.length; i++) {
      const result = await probeStreamUrl(urls[i]);
      appendLog(`[${i + 1}/${urls.length}] ${result.reachable ? "OK" : "FAIL"}`);
      appendLog(result.log);
      if (result.reachable) {
        if (i > 0) {
          appendLog(`Using candidate ${i + 1} (first reachable probe).`);
        }
        return i;
      }
    }
    appendLog("No probe succeeded; trying candidate 1 in player.");
    return 0;
  }

  // src/screens/player.ts
  var activeCleanup = null;
  var STALL_TIMEOUT_MS = 2e4;
  function renderPlayer(root2, request) {
    var _a;
    activeCleanup == null ? void 0 : activeCleanup();
    activeCleanup = null;
    const urls = [request.url, ...request.fallbackUrls];
    const isLive = request.kind === "live";
    let urlIndex = 0;
    let failedCurrent = false;
    let stallTimer = null;
    let progressTimer = null;
    let controls = null;
    root2.innerHTML = '<div class="screen player-screen"></div>';
    const screen = root2.querySelector(".player-screen");
    controls = mountPlayerControls(screen, {
      title: request.title,
      isLive,
      onBack: () => {
        saveProgress();
        appState.goHome(isLive ? "live" : request.kind === "series" ? "series" : "movies");
      },
      subtitleContext: {
        kind: request.kind,
        languageHints: (_a = request.subtitleLanguages) != null ? _a : [],
        api: appState.api,
        vodStreamId: request.vodStreamId
      }
    });
    const video = controls.getVideoElement();
    const log = (line) => {
      console.log(`[player] ${line}`);
    };
    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStallTimer = () => {
      clearStallTimer();
      if (urlIndex >= urls.length) return;
      stallTimer = setTimeout(() => {
        failCurrentUrl("Playback stalled (timeout).");
      }, STALL_TIMEOUT_MS);
    };
    const applyResumeIfNeeded = () => {
      if (isLive || request.resumePositionMs <= 5e3) return;
      const targetSec = request.resumePositionMs / 1e3;
      if (video.duration && targetSec >= video.duration - 2) return;
      try {
        video.currentTime = targetSec;
        log(`Resume seek to ${Math.floor(targetSec)}s`);
      } catch {
      }
    };
    const loadUrlAtIndex = (index) => {
      if (index >= urls.length) {
        controls == null ? void 0 : controls.setBuffering(false);
        log("All stream URLs failed.");
        clearStallTimer();
        return;
      }
      urlIndex = index;
      failedCurrent = false;
      const url = urls[index];
      log(`Opening candidate ${index + 1}/${urls.length}: ${url}`);
      controls == null ? void 0 : controls.setBuffering(true);
      video.pause();
      video.removeAttribute("src");
      video.src = url;
      video.load();
      controls == null ? void 0 : controls.setVideoUrl(url);
      void video.play().catch((err) => {
        log(`play() rejected: ${String(err)}`);
      });
      armStallTimer();
    };
    const failCurrentUrl = (reason) => {
      var _a2;
      if (failedCurrent || urlIndex >= urls.length) return;
      failedCurrent = true;
      clearStallTimer();
      const code = (_a2 = video.error) == null ? void 0 : _a2.code;
      log(`Stream failed: ${reason}${code != null ? ` (code ${code})` : ""}`);
      loadUrlAtIndex(urlIndex + 1);
    };
    const saveProgress = () => {
      var _a2, _b;
      if (!appState.accountKey || isLive) return;
      const accountKey = appState.accountKey;
      const contentKey = (_a2 = request.contentKey) != null ? _a2 : request.vodStreamId != null ? `vod:${request.vodStreamId}` : request.title;
      const entry = {
        accountKey,
        contentKey,
        kind: request.kind,
        title: request.title,
        url: (_b = urls[urlIndex]) != null ? _b : request.url,
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
    const onError = () => failCurrentUrl("Media error");
    const onPlaying = () => {
      clearStallTimer();
      controls == null ? void 0 : controls.setBuffering(false);
      log("Playback started");
    };
    const onWaiting = () => {
      controls == null ? void 0 : controls.setBuffering(true);
      armStallTimer();
    };
    const onLoadedMetadata = () => applyResumeIfNeeded();
    const onEnded = () => {
      if (isLive) failCurrentUrl("Live stream ended unexpectedly");
    };
    video.addEventListener("error", onError);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);
    progressTimer = setInterval(() => {
      if (!video.paused && !isLive && video.currentTime > 5) {
        saveProgress();
      }
    }, 15e3);
    void (async () => {
      if (isLive && urls.length > 0) {
        urlIndex = await probeBestStreamIndex(urls, log);
      }
      loadUrlAtIndex(urlIndex);
    })();
    activeCleanup = () => {
      clearStallTimer();
      if (progressTimer) clearInterval(progressTimer);
      video.removeEventListener("error", onError);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
      controls == null ? void 0 : controls.destroy();
      video.pause();
      video.removeAttribute("src");
    };
  }

  // src/main.ts
  var root;
  var renderScheduled = false;
  var lastPlayerRequestKey = null;
  function playbackRequestKey(request) {
    var _a, _b, _c;
    return [
      request.kind,
      (_a = request.contentKey) != null ? _a : "",
      request.url,
      (_b = request.vodStreamId) != null ? _b : "",
      (_c = request.episodeId) != null ? _c : ""
    ].join("|");
  }
  function isSamePlayerSession(request) {
    if (lastPlayerRequestKey === null) return false;
    const key = playbackRequestKey(request);
    if (key !== lastPlayerRequestKey) return false;
    return root.querySelector(".player-screen") != null;
  }
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
        lastPlayerRequestKey = null;
        renderLogin(root);
      } else if (screen.name === "home") {
        lastPlayerRequestKey = null;
        renderHome(root);
      } else if (screen.name === "hub-browse") {
        lastPlayerRequestKey = null;
        renderHubBrowse(root);
      } else if (screen.name === "series-detail") {
        lastPlayerRequestKey = null;
        renderSeriesDetail(root);
      } else if (screen.name === "player") {
        if (isSamePlayerSession(screen.request)) {
          return;
        }
        lastPlayerRequestKey = playbackRequestKey(screen.request);
        dismissTvKeyboard();
        renderPlayer(root, screen.request);
      }
    } catch (error) {
      showFatalError(error);
    }
    invalidateFocusCache();
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
    initFocusRoot(root);
    bindAppScreenDelegation(root);
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
