import { iptvFetch } from '../api/http';
import type { SubtitleCue } from '../models/subtitle-track';
import { parseSubtitleContent } from './subtitle-parser';

const MAX_BYTES = 4 * 1024 * 1024;

function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  if (relative.startsWith('/')) {
    return `${new URL(base).origin}${relative}`;
  }
  return new URL(relative, base).href;
}

function isM3u8(content: string, url: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith('#EXTM3U') ||
    url.toLowerCase().includes('.m3u8') ||
    trimmed.includes('#EXT-X-TARGETDURATION')
  );
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await iptvFetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return null;
    return new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

function parseHlsWebVttPlaylist(text: string, playlistUrl: string): SubtitleCue[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const segments: { url: string; duration: number }[] = [];
  let pendingDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:([0-9.]+)/);
      pendingDuration = match ? parseFloat(match[1]) : 0;
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    segments.push({ url: resolveUrl(playlistUrl, line), duration: pendingDuration });
    pendingDuration = 0;
  }

  return segments;
}

async function loadHlsWebVttCues(playlistUrl: string): Promise<SubtitleCue[]> {
  const playlistText = await fetchText(playlistUrl);
  if (!playlistText) return [];

  if (!isM3u8(playlistText, playlistUrl)) {
    return parseSubtitleContent(playlistText, playlistUrl);
  }

  const segments = parseHlsWebVttPlaylist(playlistText, playlistUrl);
  if (segments.length === 0) return [];

  const cues: SubtitleCue[] = [];
  let offset = 0;
  for (const segment of segments) {
    const segmentText = await fetchText(segment.url);
    if (segmentText) {
      const segmentCues = parseSubtitleContent(segmentText, segment.url);
      for (const cue of segmentCues) {
        cues.push({
          start: cue.start + offset,
          end: cue.end + offset,
          text: cue.text,
        });
      }
    }
    offset += segment.duration;
  }
  return cues;
}

export async function loadSubtitleCues(url: string, baseUrl?: string): Promise<SubtitleCue[]> {
  const resolved = baseUrl ? resolveUrl(baseUrl, url) : url;
  const text = await fetchText(resolved);
  if (!text) return [];

  if (isM3u8(text, resolved)) {
    return loadHlsWebVttCues(resolved);
  }

  return parseSubtitleContent(text, resolved);
}

export async function validateSubtitleUrl(url: string, baseUrl?: string): Promise<SubtitleCue[]> {
  const cues = await loadSubtitleCues(url, baseUrl);
  return cues.length > 0 ? cues : [];
}
