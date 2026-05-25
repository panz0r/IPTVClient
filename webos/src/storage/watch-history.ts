export type PlaybackKind = 'live' | 'vod' | 'series';

export interface WatchHistoryEntry {
  accountKey: string;
  contentKey: string;
  kind: PlaybackKind;
  title: string;
  url: string;
  fallbackUrls: string[];
  imageUrl: string | null;
  positionMs: number;
  durationMs: number | null;
  updatedAt: string | null;
  vodStreamId: number | null;
  seriesId: number | null;
  episodeId: number | null;
  seriesTitle: string | null;
  subtitle: string | null;
}

export interface PlaybackRequest {
  title: string;
  url: string;
  fallbackUrls: string[];
  kind: PlaybackKind;
  streamId: number | null;
  contentKey: string | null;
  imageUrl: string | null;
  resumePositionMs: number;
  vodStreamId: number | null;
  seriesId: number | null;
  episodeId: number | null;
  seriesTitle: string | null;
}

const MAX_ENTRIES = 30;

function storageKey(accountKey: string): string {
  return `watch_history_${accountKey}`;
}

export function accountKeyFor(serverUrl: string, username: string): string {
  return `${serverUrl}|${username}`;
}

export function loadHistory(accountKey: string): WatchHistoryEntry[] {
  const raw = localStorage.getItem(storageKey(accountKey));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WatchHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistory(
  accountKey: string,
  entries: WatchHistoryEntry[],
): void {
  localStorage.setItem(
    storageKey(accountKey),
    JSON.stringify(entries.slice(0, MAX_ENTRIES)),
  );
}

export function upsertHistory(entry: WatchHistoryEntry): void {
  const entries = loadHistory(entry.accountKey).filter(
    (e) => e.contentKey !== entry.contentKey,
  );
  entries.unshift(entry);
  saveHistory(entry.accountKey, entries);
}

export function vodContentKey(streamId: number): string {
  return `vod:${streamId}`;
}

export function seriesEpisodeContentKey(
  seriesId: number,
  episodeId: number,
): string {
  return `series:${seriesId}:ep:${episodeId}`;
}

export function entryToPlaybackRequest(entry: WatchHistoryEntry): PlaybackRequest {
  return {
    title: entry.title,
    url: entry.url,
    fallbackUrls: entry.fallbackUrls,
    kind: entry.kind,
    streamId: entry.vodStreamId,
    contentKey: entry.contentKey,
    imageUrl: entry.imageUrl,
    resumePositionMs: entry.positionMs > 5000 ? entry.positionMs : 0,
    vodStreamId: entry.vodStreamId,
    seriesId: entry.seriesId,
    episodeId: entry.episodeId,
    seriesTitle: entry.seriesTitle,
  };
}
