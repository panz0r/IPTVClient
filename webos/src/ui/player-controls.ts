import type { XtreamApi } from '../api/xtream';
import type { ExternalSubtitleTrack } from '../models/subtitle-track';
import type { PlaybackKind } from '../storage/watch-history';
import { loadSubtitleCues } from '../services/subtitle-loader';
import { resolveExternalSubtitleTracks } from '../services/subtitle-resolver';
import { mountSubtitleOverlay } from './subtitle-overlay';

const HIDE_AFTER_MS = 4000;
const SEEK_STEP_SEC = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isOkKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.keyCode === 13 || event.keyCode === 28;
}

function arrowDirection(event: KeyboardEvent): 'up' | 'down' | 'left' | 'right' | null {
  const code = event.keyCode;
  if (event.key === 'ArrowUp' || code === 38) return 'up';
  if (event.key === 'ArrowDown' || code === 40) return 'down';
  if (event.key === 'ArrowLeft' || code === 37) return 'left';
  if (event.key === 'ArrowRight' || code === 39) return 'right';
  return null;
}

function isPlayPauseKey(event: KeyboardEvent): boolean {
  return event.keyCode === 415 || event.keyCode === 19 || event.key === 'MediaPlayPause';
}

function isRewindKey(event: KeyboardEvent): boolean {
  return event.keyCode === 412 || event.key === 'MediaRewind';
}

function isForwardKey(event: KeyboardEvent): boolean {
  return event.keyCode === 417 || event.key === 'MediaFastForward';
}

function isSubtitleRemoteKey(event: KeyboardEvent): boolean {
  return event.keyCode === 460 || event.keyCode === 462 || event.key === 'Subtitle';
}

export interface PlayerControlsOptions {
  title: string;
  isLive: boolean;
  onBack(): void;
  subtitleContext?: {
    kind: PlaybackKind;
    languageHints: string[];
    api: XtreamApi | null;
    vodStreamId: number | null;
  };
}

export interface PlayerControlsHandle {
  destroy(): void;
  getVideoElement(): HTMLVideoElement;
  setBuffering(buffering: boolean): void;
  showControls(): void;
  setVideoUrl(url: string): void;
}

function buildPlayerChromeHtml(title: string, isLive: boolean): string {
  const seekSection = isLive
    ? ''
    : `
        <div class="player-seek-section" id="player-seek-section">
          <div class="player-seek-times">
            <span class="player-time" id="player-time-current">0:00</span>
            <span class="player-time" id="player-time-duration">0:00</span>
          </div>
          <div class="player-seek-bar" id="player-seek-bar">
            <div class="player-seek-track">
              <div class="player-seek-fill" id="player-seek-fill"></div>
              <div class="player-seek-thumb" id="player-seek-thumb"></div>
            </div>
          </div>
        </div>`;

  return `
    <video id="player-video" class="player-video" autoplay playsinline preload="auto"></video>
    <div class="player-hit-layer" id="player-hit" tabindex="0"></div>
    <div class="player-chrome player-chrome--visible" id="player-chrome">
      <div class="player-top-bar">
        <button type="button" class="player-back-btn focusable" id="player-back" tabindex="0" aria-label="Back">
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
      </div>
      <div class="player-buffering hidden" id="player-buffering"><div class="spinner"></div></div>
      <div class="player-track-panel hidden" id="player-track-panel">
        <p class="player-track-heading">Subtitles</p>
        <div class="player-track-list" id="player-track-list"></div>
      </div>
      <div class="player-bottom">
        ${seekSection}
        <p class="player-transport-title">${escapeHtml(title)}</p>
        <div class="player-transport-main">
          <button type="button" class="player-play-btn focusable" id="player-play" tabindex="0" aria-label="Play">
            <svg class="player-icon-play" viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <svg class="player-icon-pause hidden" viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button type="button" class="player-subs-btn focusable player-transport-btn--subs" id="player-subs" tabindex="0" aria-label="Subtitles">
            <svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg>
          </button>
          ${isLive ? '<span class="player-live-badge">LIVE</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

export function mountPlayerControls(
  screen: HTMLElement,
  options: PlayerControlsOptions,
): PlayerControlsHandle {
  const { title, isLive, onBack, subtitleContext } = options;
  screen.innerHTML = buildPlayerChromeHtml(title, isLive);
  const subtitleOverlay = mountSubtitleOverlay(screen);
  subtitleOverlay.bindVideo(screen.querySelector<HTMLVideoElement>('#player-video')!);

  const video = screen.querySelector<HTMLVideoElement>('#player-video')!;
  const chrome = screen.querySelector<HTMLElement>('#player-chrome')!;
  const hitLayer = screen.querySelector<HTMLElement>('#player-hit')!;
  const backBtn = screen.querySelector<HTMLButtonElement>('#player-back')!;
  const bufferingEl = screen.querySelector<HTMLElement>('#player-buffering')!;
  const trackPanel = screen.querySelector<HTMLElement>('#player-track-panel')!;
  const trackList = screen.querySelector<HTMLElement>('#player-track-list')!;
  const playBtn = screen.querySelector<HTMLButtonElement>('#player-play')!;
  const playIcon = playBtn.querySelector('.player-icon-play')!;
  const pauseIcon = playBtn.querySelector('.player-icon-pause')!;
  const subsBtn = screen.querySelector<HTMLButtonElement>('#player-subs')!;
  const seekBar = screen.querySelector<HTMLElement>('#player-seek-bar');
  const seekFill = screen.querySelector<HTMLElement>('#player-seek-fill');
  const seekThumb = screen.querySelector<HTMLElement>('#player-seek-thumb');
  const timeCurrent = screen.querySelector<HTMLElement>('#player-time-current');
  const timeDuration = screen.querySelector<HTMLElement>('#player-time-duration');

  let visible = true;
  let trackMenuOpen = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let seekDragging = false;
  let selectedTrackKey = 'off';
  let focusTarget: 'back' | 'play' | 'subs' = 'play';
  let externalLoadToken = 0;
  let externalTracks: ExternalSubtitleTrack[] = [];
  let externalTracksLoading = false;
  let externalTracksError: string | null = null;
  let currentVideoUrl = '';

  const clearHideTimer = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  };

  const setRemoteFocusEnabled = (enabled: boolean) => {
    const candidates = screen.querySelectorAll<HTMLElement>(
      '#player-back, #player-play, #player-subs, .player-track-option',
    );
    for (const el of candidates) {
      if (el.classList.contains('hidden')) {
        el.tabIndex = -1;
        continue;
      }
      if (el.classList.contains('player-track-option') && !trackMenuOpen) {
        el.tabIndex = -1;
        continue;
      }
      el.tabIndex = enabled ? 0 : -1;
    }
    hitLayer.tabIndex = enabled ? -1 : 0;
    if (enabled) {
      const el =
        focusTarget === 'back' ? backBtn : focusTarget === 'subs' ? subsBtn : playBtn;
      el.focus();
    } else {
      hitLayer.focus();
    }
  };

  const refreshRemoteFocus = () => {
    setRemoteFocusEnabled(visible);
  };

  const setChromeVisible = (show: boolean) => {
    visible = show;
    chrome.classList.toggle('player-chrome--visible', show);
    chrome.classList.toggle('player-chrome--hidden', !show);
    setRemoteFocusEnabled(show);
    if (!show) {
      trackMenuOpen = false;
      trackPanel.classList.add('hidden');
      subsBtn.classList.remove('player-transport-btn--active');
    }
  };

  const resetHideTimer = () => {
    clearHideTimer();
    if (!visible) return;
    hideTimer = setTimeout(() => setChromeVisible(false), HIDE_AFTER_MS);
  };

  const showControls = (keepMenu = false) => {
    setChromeVisible(true);
    if (!keepMenu) {
      trackMenuOpen = false;
      trackPanel.classList.add('hidden');
      subsBtn.classList.remove('player-transport-btn--active');
    }
    resetHideTimer();
  };

  const onUserInteraction = () => {
    if (!visible) showControls(trackMenuOpen);
    else resetHideTimer();
  };

  const updatePlayIcon = () => {
    const playing = !video.paused && !video.ended;
    playIcon.classList.toggle('hidden', playing);
    pauseIcon.classList.toggle('hidden', !playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };

  const pauseAndShow = () => {
    if (!video.paused && !video.ended) {
      video.pause();
      updatePlayIcon();
    }
    focusTarget = 'play';
    showControls();
  };

  const seekRelative = (deltaSec: number) => {
    if (isLive || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSec));
    onUserInteraction();
    updateSeekUi();
  };

  const seekToFraction = (fraction: number) => {
    if (isLive || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    video.currentTime = video.duration * clamped;
    updateSeekUi();
  };

  const updateSeekUi = () => {
    if (!timeCurrent || !timeDuration) return;
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      timeDuration.textContent = '0:00';
      if (seekFill) seekFill.style.width = '0%';
      if (seekThumb) seekThumb.style.left = '0%';
      return;
    }
    const fraction = video.currentTime / dur;
    timeCurrent.textContent = formatTime(video.currentTime);
    timeDuration.textContent = formatTime(dur);
    if (!seekDragging && seekFill && seekThumb) {
      const pct = `${fraction * 100}%`;
      seekFill.style.width = pct;
      seekThumb.style.left = pct;
    }
  };

  const applySubtitleTrack = (trackKey: string) => {
    selectedTrackKey = trackKey;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = 'hidden';
    }
    subtitleOverlay.clear();

    if (trackKey === 'off') {
      renderTrackList();
      return;
    }

    if (!trackKey.startsWith('ext:')) {
      renderTrackList();
      return;
    }

    const id = trackKey.slice(4);
    const track = externalTracks.find((t) => t.id === id);
    if (!track) {
      renderTrackList();
      return;
    }

    void (async () => {
      try {
        const cues = await loadSubtitleCues(track.url, currentVideoUrl || video.src);
        if (selectedTrackKey !== trackKey) return;
        if (cues.length === 0) {
          console.warn(`[subtitles] No cues parsed from ${track.url}`);
          selectedTrackKey = 'off';
          renderTrackList();
          return;
        }
        subtitleOverlay.setCues(cues);
        subtitleOverlay.bindVideo(video);
        subtitleOverlay.syncNow(video);
        console.log(`[subtitles] Loaded ${cues.length} cues from ${track.label}`);
        renderTrackList();
      } catch (err) {
        console.warn(`[subtitles] Failed to load ${track.url}:`, err);
        selectedTrackKey = 'off';
        renderTrackList();
      }
    })();
    renderTrackList();
  };

  const loadExternalTracks = (videoUrl: string) => {
    if (!subtitleContext || !videoUrl) return;
    currentVideoUrl = videoUrl;
    const token = ++externalLoadToken;
    externalTracksLoading = true;
    externalTracksError = null;
    externalTracks = [];
    if (selectedTrackKey.startsWith('ext:')) {
      selectedTrackKey = 'off';
      subtitleOverlay.clear();
    }
    renderTrackList();

    void (async () => {
      try {
        const tracks = await resolveExternalSubtitleTracks({
          videoUrl,
          kind: subtitleContext.kind,
          languageHints: subtitleContext.languageHints,
          api: subtitleContext.api,
          vodStreamId: subtitleContext.vodStreamId,
        });
        if (token !== externalLoadToken || videoUrl !== currentVideoUrl) return;
        externalTracks = tracks;
        if (tracks.length === 0) {
          externalTracksError = 'No external subtitle files found for this stream.';
        }
      } catch {
        if (token === externalLoadToken) {
          externalTracksError = 'Could not search for subtitles.';
        }
      } finally {
        if (token === externalLoadToken) {
          externalTracksLoading = false;
          renderTrackList();
        }
      }
    })();
  };

  const renderTrackList = () => {
    const items: { label: string; key: string; disabled?: boolean }[] = [
      { label: 'Off', key: 'off' },
    ];
    for (const track of externalTracks) {
      items.push({ label: track.label, key: `ext:${track.id}` });
    }
    if (externalTracksLoading) {
      items.push({ label: 'Searching for subtitles…', key: 'loading', disabled: true });
    } else if (externalTracks.length === 0) {
      items.push({
        label: externalTracksError ?? 'No subtitles found',
        key: 'none',
        disabled: true,
      });
    }

    subsBtn.classList.remove('hidden');
    trackList.innerHTML = items
      .map(
        (item) =>
          `<button type="button" class="player-track-option focusable${selectedTrackKey === item.key ? ' player-track-option--active' : ''}${item.disabled ? ' player-track-option--disabled' : ''}" data-track-key="${item.key}" tabindex="${item.disabled ? '-1' : '0'}"${item.disabled ? ' disabled' : ''}>${escapeHtml(item.label)}</button>`,
      )
      .join('');

    for (const btn of trackList.querySelectorAll<HTMLButtonElement>('.player-track-option:not([disabled])')) {
      btn.addEventListener('click', () => {
        const key = btn.dataset.trackKey ?? 'off';
        if (key === 'loading' || key === 'none') return;
        applySubtitleTrack(key);
        onUserInteraction();
      });
    }
    if (trackMenuOpen) refreshRemoteFocus();
  };

  const toggleTrackMenu = () => {
    trackMenuOpen = !trackMenuOpen;
    trackPanel.classList.toggle('hidden', !trackMenuOpen);
    subsBtn.classList.toggle('player-transport-btn--active', trackMenuOpen);
    if (trackMenuOpen) {
      showControls(true);
      refreshRemoteFocus();
      trackList.querySelector<HTMLElement>('.player-track-option')?.focus();
    }
    resetHideTimer();
  };

  const togglePlayPause = () => {
    onUserInteraction();
    if (video.paused || video.ended) void video.play();
    else video.pause();
    updatePlayIcon();
  };

  const focusPrimaryTarget = (target: 'back' | 'play' | 'subs') => {
    focusTarget = target;
    const el = target === 'back' ? backBtn : target === 'subs' ? subsBtn : playBtn;
    el.focus();
    backBtn.classList.toggle('player-focus-active', target === 'back');
    playBtn.classList.toggle('player-focus-active', target === 'play');
    subsBtn.classList.toggle('player-focus-active', target === 'subs');
  };

  const onPlayerKeyDown = (event: KeyboardEvent) => {
    if (!document.querySelector('.player-screen')) return;

    const current = document.activeElement as HTMLElement | null;

    if (isPlayPauseKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (!visible) pauseAndShow();
      else togglePlayPause();
      return;
    }

    if (isRewindKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      showControls();
      seekRelative(-SEEK_STEP_SEC);
      return;
    }

    if (isForwardKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      showControls();
      seekRelative(SEEK_STEP_SEC);
      return;
    }

    if (isSubtitleRemoteKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      renderTrackList();
      showControls(true);
      if (!trackMenuOpen) toggleTrackMenu();
      focusPrimaryTarget('subs');
      return;
    }

    if (isOkKey(event)) {
      if (
        current?.classList.contains('player-track-option') &&
        !(current as HTMLButtonElement).disabled
      ) {
        event.preventDefault();
        event.stopPropagation();
        const key = (current as HTMLButtonElement).dataset.trackKey ?? 'off';
        if (key !== 'loading' && key !== 'none') {
          applySubtitleTrack(key);
          trackMenuOpen = false;
          trackPanel.classList.add('hidden');
          subsBtn.classList.remove('player-transport-btn--active');
          focusPrimaryTarget('subs');
        }
        onUserInteraction();
        return;
      }
      if (current === subsBtn) {
        event.preventDefault();
        event.stopPropagation();
        toggleTrackMenu();
        return;
      }
      if (current === backBtn) {
        event.preventDefault();
        event.stopPropagation();
        onBack();
        return;
      }
      if (current === playBtn && visible) {
        event.preventDefault();
        event.stopPropagation();
        togglePlayPause();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pauseAndShow();
      return;
    }

    const dir = arrowDirection(event);
    if (dir) {
      event.preventDefault();
      event.stopPropagation();

      if (!visible) {
        showControls();
        if (dir === 'left') seekRelative(-SEEK_STEP_SEC);
        if (dir === 'right') seekRelative(SEEK_STEP_SEC);
        focusPrimaryTarget('play');
        return;
      }

      onUserInteraction();

      if (trackMenuOpen && current?.classList.contains('player-track-option')) {
        if (dir === 'up' || dir === 'down') {
          const options = Array.from(trackList.querySelectorAll<HTMLElement>('.player-track-option'));
          const idx = options.indexOf(current);
          const next = dir === 'up' ? options[idx - 1] : options[idx + 1];
          if (next) next.focus();
          else if (dir === 'down') {
            trackMenuOpen = false;
            trackPanel.classList.add('hidden');
            subsBtn.classList.remove('player-transport-btn--active');
            focusPrimaryTarget('play');
          }
        }
        return;
      }

      if (dir === 'left') {
        seekRelative(-SEEK_STEP_SEC);
        return;
      }
      if (dir === 'right') {
        seekRelative(SEEK_STEP_SEC);
        return;
      }
      if (dir === 'up') {
        if (current === subsBtn) focusPrimaryTarget('play');
        else if (current === playBtn) focusPrimaryTarget('back');
        else focusPrimaryTarget('back');
        return;
      }
      if (dir === 'down') {
        if (current === backBtn) focusPrimaryTarget('play');
        else if (current === playBtn) focusPrimaryTarget('subs');
        else focusPrimaryTarget('subs');
      }
    }
  };

  document.addEventListener('keydown', onPlayerKeyDown, true);

  backBtn.addEventListener('click', onBack);
  playBtn.addEventListener('click', togglePlayPause);
  subsBtn.addEventListener('click', toggleTrackMenu);

  hitLayer.addEventListener('click', () => {
    if (visible) togglePlayPause();
    else pauseAndShow();
  });
  hitLayer.addEventListener('mousemove', onUserInteraction);

  if (seekBar && seekFill && seekThumb) {
    const seekFromClientX = (clientX: number) => {
      const rect = seekBar.getBoundingClientRect();
      if (rect.width <= 0) return;
      seekToFraction((clientX - rect.left) / rect.width);
    };

    seekBar.addEventListener('mousedown', (event) => {
      seekDragging = true;
      onUserInteraction();
      seekFromClientX(event.clientX);
    });
    document.addEventListener('mousemove', (event) => {
      if (!seekDragging) return;
      seekFromClientX(event.clientX);
    });
    document.addEventListener('mouseup', () => {
      if (!seekDragging) return;
      seekDragging = false;
      onUserInteraction();
    });
  }

  const onTimeUpdate = () => updateSeekUi();
  const onPlayState = () => updatePlayIcon();
  const onLoadedMetadata = () => updateSeekUi();
  const onCanPlay = () => {
    if (video.src) loadExternalTracks(video.src);
  };

  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('play', onPlayState);
  video.addEventListener('pause', onPlayState);
  video.addEventListener('canplay', onCanPlay);
  video.addEventListener('loadedmetadata', onLoadedMetadata);

  showControls();
  focusPrimaryTarget('play');

  return {
    destroy() {
      clearHideTimer();
      document.removeEventListener('keydown', onPlayerKeyDown, true);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlayState);
      video.removeEventListener('pause', onPlayState);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      subtitleOverlay.destroy();
    },
    getVideoElement() {
      return video;
    },
    setBuffering(buffering: boolean) {
      bufferingEl.classList.toggle('hidden', !buffering);
    },
    showControls() {
      showControls();
    },
    setVideoUrl(url: string) {
      loadExternalTracks(url);
    },
  };
}
