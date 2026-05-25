import type { XtreamApi, VodItem } from '../api/xtream';
import { mergeVodGenreCache } from '../storage/vod-genre-cache';

const BATCH_SIZE = 20;

export async function indexMissingVodGenres(options: {
  api: XtreamApi;
  accountKey: string;
  movies: VodItem[];
  cached: Record<number, string>;
  isCancelled: () => boolean;
  onProgress?: (genres: Record<number, string>) => void;
}): Promise<Record<number, string>> {
  const { api, accountKey, movies, isCancelled, onProgress } = options;
  let cached = { ...options.cached };

  const missing = movies.filter(
    (m) => !cached[m.streamId] && !(m.genre?.trim()),
  );
  if (missing.length === 0) return cached;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    if (isCancelled()) break;

    const batch = missing.slice(i, i + BATCH_SIZE);
    const updates: Record<number, string> = {};

    await Promise.all(
      batch.map(async (movie) => {
        try {
          const info = await api.getVodInfo(movie.streamId);
          const genre = info.genre?.trim();
          if (genre) updates[movie.streamId] = genre;
        } catch {
          /* provider may not return detail for some titles */
        }
      }),
    );

    if (Object.keys(updates).length > 0) {
      cached = mergeVodGenreCache(accountKey, updates);
      onProgress?.(cached);
    }
  }

  return cached;
}
