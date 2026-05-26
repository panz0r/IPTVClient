export interface SubtitleHint {
  label: string;
  url?: string;
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

export function parseSubtitleHints(value: unknown): SubtitleHint[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return parseSubtitleHints(JSON.parse(trimmed));
      } catch {
        /* plain label */
      }
    }
    if (isUrlLike(trimmed)) {
      const label = trimmed.split('/').pop() ?? trimmed;
      return [{ label, url: trimmed }];
    }
    return [{ label: trimmed }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseSubtitleHints(item));
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const url = row.url ?? row.path ?? row.file ?? row.src ?? row.link;
    const labelRaw = row.lang ?? row.language ?? row.name ?? row.title ?? row.label;
    const urlStr = url != null ? String(url).trim() : '';
    const labelStr = labelRaw != null ? String(labelRaw).trim() : '';
    if (urlStr) {
      return [{ label: labelStr || urlStr.split('/').pop() || 'Subtitle', url: urlStr }];
    }
    if (labelStr) return [{ label: labelStr }];
  }
  return [];
}

export function subtitleHintsToLanguages(hints: SubtitleHint[]): string[] {
  const values: string[] = [];
  for (const hint of hints) {
    if (hint.url) values.push(hint.url);
    values.push(hint.label);
  }
  return values.filter((v, i, arr) => v && arr.indexOf(v) === i);
}
