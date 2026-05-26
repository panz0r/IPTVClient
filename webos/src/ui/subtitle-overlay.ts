import type { SubtitleCue } from '../models/subtitle-track';

export interface SubtitleOverlayHandle {
  destroy(): void;
  setCues(cues: SubtitleCue[]): void;
  bindVideo(video: HTMLVideoElement): void;
  syncNow(video: HTMLVideoElement): void;
  clear(): void;
}

export function mountSubtitleOverlay(screen: HTMLElement): SubtitleOverlayHandle {
  const el = document.createElement('div');
  el.className = 'player-subtitle-overlay hidden';
  el.innerHTML = '<span class="player-subtitle-text"></span>';
  screen.appendChild(el);
  const textEl = el.querySelector<HTMLElement>('.player-subtitle-text')!;

  let cues: SubtitleCue[] = [];
  let boundVideo: HTMLVideoElement | null = null;
  let onTimeUpdate: (() => void) | null = null;

  const update = (video: HTMLVideoElement) => {
    const t = video.currentTime;
    const active = cues.find((c) => t >= c.start && t < c.end);
    if (active) {
      textEl.textContent = active.text;
      el.classList.remove('hidden');
    } else {
      textEl.textContent = '';
      el.classList.add('hidden');
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
        video.removeEventListener('timeupdate', onTimeUpdate);
      }
      onTimeUpdate = () => update(video);
      video.addEventListener('timeupdate', onTimeUpdate);
      update(video);
    },
    syncNow(video) {
      update(video);
    },
    clear() {
      cues = [];
      textEl.textContent = '';
      el.classList.add('hidden');
    },
  };
}
