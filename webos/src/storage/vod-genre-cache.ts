function storageKey(accountKey: string): string {
  return `vod_genre_cache_${accountKey}`;
}

export function loadVodGenreCache(accountKey: string): Record<number, string> {
  const raw = localStorage.getItem(storageKey(accountKey));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[parseInt(key, 10)] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeVodGenreCache(
  accountKey: string,
  updates: Record<number, string>,
): Record<number, string> {
  if (Object.keys(updates).length === 0) {
    return loadVodGenreCache(accountKey);
  }
  const existing = loadVodGenreCache(accountKey);
  Object.assign(existing, updates);
  const encoded: Record<string, string> = {};
  for (const [id, genre] of Object.entries(existing)) {
    encoded[String(id)] = genre;
  }
  localStorage.setItem(storageKey(accountKey), JSON.stringify(encoded));
  return existing;
}
