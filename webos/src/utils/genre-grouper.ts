import type { HubContentRow } from '../models/hub-row';

/** Splits multi-genre strings on comma, pipe, or slash only (not "&"). */
export function parseGenres(genreString: string | null | undefined): string[] {
  if (!genreString?.trim()) return [];
  return genreString
    .split(/[,|/]/)
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export function groupByGenre<T>(options: {
  items: T[];
  genreFor: (item: T) => string | null | undefined;
  maxRows?: number;
  minItemsPerRow?: number;
}): HubContentRow<T>[] {
  const { items, genreFor, maxRows, minItemsPerRow = 1 } = options;
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const genres = parseGenres(genreFor(item));
    for (const genre of genres) {
      const key = genre.toLowerCase();
      const bucket = buckets.get(key) ?? [];
      bucket.push(item);
      buckets.set(key, bucket);
    }
  }

  const sortedKeys = [...buckets.keys()].sort(
    (a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0),
  );

  const rows: HubContentRow<T>[] = [];
  for (const key of sortedKeys) {
    if (maxRows != null && rows.length >= maxRows) break;
    const bucketItems = buckets.get(key)!;
    if (bucketItems.length < minItemsPerRow) continue;
    rows.push({
      id: `genre:${key}`,
      title: displayGenreName(bucketItems, genreFor, key),
      items: bucketItems,
    });
  }

  return rows;
}

function displayGenreName<T>(
  items: T[],
  genreFor: (item: T) => string | null | undefined,
  normalizedKey: string,
): string {
  for (const item of items) {
    for (const genre of parseGenres(genreFor(item))) {
      if (genre.toLowerCase() === normalizedKey) return genre;
    }
  }
  return normalizedKey;
}
