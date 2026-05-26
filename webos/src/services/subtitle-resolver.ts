import { iptvFetch } from '../api/http';
import type { XtreamApi } from '../api/xtream';
import type { PlaybackKind } from '../storage/watch-history';
import type { ExternalSubtitleTrack } from '../models/subtitle-track';
import { validateSubtitleUrl } from './subtitle-loader';
import { parseSubtitleHints, type SubtitleHint } from '../utils/subtitle-hints';

function langVariants(lang: string): string[] {
  const raw = lang.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const variants = new Set<string>([lower, raw]);
  const map: Record<string, string[]> = {
    english: ['en', 'eng', 'english'],
    en: ['en', 'eng', 'english'],
    swedish: ['sv', 'swe', 'swedish'],
    sv: ['sv', 'swe', 'swedish'],
    german: ['de', 'deu', 'ger', 'german'],
    de: ['de', 'deu', 'ger', 'german'],
    french: ['fr', 'fre', 'fra', 'french'],
    fr: ['fr', 'fre', 'fra', 'french'],
    spanish: ['es', 'spa', 'spanish'],
    es: ['es', 'spa', 'spanish'],
    norwegian: ['no', 'nor', 'nb', 'norwegian'],
    no: ['no', 'nor', 'nb', 'norwegian'],
  };
  for (const v of map[lower] ?? []) variants.add(v);
  return [...variants];
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  if (relative.startsWith('/')) {
    const origin = new URL(base).origin;
    return `${origin}${relative}`;
  }
  return new URL(relative, base).href;
}

export { parseSubtitleHints, subtitleHintsToLanguages, type SubtitleHint } from '../utils/subtitle-hints';

function buildSidecarCandidates(videoUrl: string, languageHints: string[]): string[] {
  const urls = new Set<string>();
  const withoutQuery = videoUrl.split('?')[0];
  const base = withoutQuery.replace(/\.[a-z0-9]+$/i, '');
  const exts = ['srt', 'vtt'];

  for (const ext of exts) {
    urls.add(`${base}.${ext}`);
    urls.add(`${base}.en.${ext}`);
    urls.add(`${base}.eng.${ext}`);
  }

  for (const hint of languageHints) {
    if (isUrlLike(hint)) {
      urls.add(hint.startsWith('/') ? resolveUrl(videoUrl, hint) : hint);
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

function labelFromUrl(url: string, fallback: string): string {
  const filename = url.split('/').pop()?.split('?')[0] ?? url;
  if (/\.(srt|vtt)$/i.test(filename)) {
    const stem = filename.replace(/\.(srt|vtt)$/i, '');
    if (/^\d+$/.test(stem)) return fallback;
    return stem.replace(/[._-]/g, ' ').trim() || fallback;
  }
  return fallback;
}

async function discoverHlsSubtitleTracks(masterUrl: string): Promise<ExternalSubtitleTrack[]> {
  try {
    const response = await iptvFetch(masterUrl);
    if (!response.ok) return [];
    const text = await response.text();
    const tracks: ExternalSubtitleTrack[] = [];
    for (const line of text.split('\n')) {
      if (!line.includes('TYPE=SUBTITLES')) continue;
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (!uriMatch) continue;
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const label = nameMatch?.[1] || langMatch?.[1] || `Subtitle ${tracks.length + 1}`;
      tracks.push({
        id: `hls:${tracks.length}:${uriMatch[1]}`,
        label,
        url: resolveUrl(masterUrl, uriMatch[1]),
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

export async function resolveExternalSubtitleTracks(options: {
  videoUrl: string;
  kind: PlaybackKind;
  languageHints: string[];
  api: XtreamApi | null;
  vodStreamId: number | null;
}): Promise<ExternalSubtitleTrack[]> {
  const { videoUrl, languageHints, api, vodStreamId } = options;
  const hints: SubtitleHint[] = [];
  for (const entry of languageHints) {
    hints.push(...parseSubtitleHints(entry));
  }
  const candidates: ExternalSubtitleTrack[] = [];
  const seenUrls = new Set<string>();

  const addCandidate = (url: string, label: string, idPrefix: string) => {
    const resolved = resolveUrl(videoUrl, url);
    if (seenUrls.has(resolved)) return;
    seenUrls.add(resolved);
    candidates.push({
      id: `${idPrefix}:${candidates.length}`,
      label: labelFromUrl(resolved, label),
      url: resolved,
    });
  };

  if (api && vodStreamId != null && options.kind === 'vod') {
    try {
      const info = await api.getVodInfo(vodStreamId);
      for (const entry of info.subtitles) {
        hints.push(...parseSubtitleHints(entry));
      }
    } catch {
      /* ignore */
    }
  }

  for (const hint of hints) {
    if (hint.url) {
      addCandidate(hint.url, hint.label, 'api');
    }
  }

  if (videoUrl.toLowerCase().includes('.m3u8')) {
    const hlsTracks = await discoverHlsSubtitleTracks(videoUrl);
    for (const track of hlsTracks) {
      addCandidate(track.url, track.label, 'hls');
    }
  }

  for (const url of buildSidecarCandidates(
    videoUrl,
    hints.map((h) => h.url ?? h.label),
  )) {
    addCandidate(url, url.split('/').pop() ?? url, 'sidecar');
  }

  const found: ExternalSubtitleTrack[] = [];
  for (const candidate of candidates) {
    const cues = await validateSubtitleUrl(candidate.url, videoUrl);
    if (cues.length > 0) {
      found.push(candidate);
    }
  }

  return found;
}
