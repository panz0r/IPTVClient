const DEFAULT_FORMATS = ['ts', 'm3u8'];
const PREFERRED_ORDER = ['ts', 'm3u8', 'mkv', 'mp4', 'rtmp'];

export function resolveLiveFormats(
  allowedOutputFormats: string[] | null,
): string[] {
  if (!allowedOutputFormats || allowedOutputFormats.length === 0) {
    return [...DEFAULT_FORMATS];
  }

  const normalized = new Set(
    allowedOutputFormats
      .map((f) => f.trim().toLowerCase())
      .filter((f) => f.length > 0),
  );

  if (normalized.size === 0) {
    return [...DEFAULT_FORMATS];
  }

  const ordered: string[] = [];
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
