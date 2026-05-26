import type { SubtitleCue } from '../models/subtitle-track';

function parseTimestamp(value: string): number {
  const cleaned = value.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const [h, m, rest] = parts;
    const [s, ms = '0'] = rest.split('.');
    return (
      parseInt(h, 10) * 3600 +
      parseInt(m, 10) * 60 +
      parseInt(s, 10) +
      parseInt(ms.padEnd(3, '0').slice(0, 3), 10) / 1000
    );
  }
  if (parts.length === 2) {
    const [m, rest] = parts;
    const [s, ms = '0'] = rest.split('.');
    return parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms.padEnd(3, '0').slice(0, 3), 10) / 1000;
  }
  return 0;
}

export function parseSubtitleContent(content: string, url: string): SubtitleCue[] {
  const trimmed = content.trim();
  if (trimmed.startsWith('WEBVTT') || url.toLowerCase().includes('.vtt')) {
    return parseVtt(trimmed);
  }
  return parseSrt(trimmed);
}

function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r/g, '').trim();
  const blocks = normalized.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim());
    const textStart = lines.indexOf(timeLine) + 1;
    const text = lines
      .slice(textStart)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\.*?\}/g, '')
      .trim();
    if (!text) continue;
    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);
    if (end <= start) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

function parseVtt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const body = content.replace(/^WEBVTT[^\n]*\n/i, '');
  const blocks = body.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim().split(' ')[0]);
    const textStart = lines.indexOf(timeLine) + 1;
    const text = lines
      .slice(textStart)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    cues.push({
      start: parseTimestamp(startStr),
      end: parseTimestamp(endStr),
      text,
    });
  }
  return cues;
}
