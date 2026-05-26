import {

  upsertHistory,

  type PlaybackRequest,

  type WatchHistoryEntry,

} from '../storage/watch-history';

import { appState } from '../state/app-state';

import { mountPlayerControls, type PlayerControlsHandle } from '../ui/player-controls';

import { probeBestStreamIndex } from '../services/stream-probe';



let activeCleanup: (() => void) | null = null;



const STALL_TIMEOUT_MS = 20_000;



export function renderPlayer(

  root: HTMLElement,

  request: PlaybackRequest,

): void {

  activeCleanup?.();

  activeCleanup = null;



  const urls = [request.url, ...request.fallbackUrls];

  const isLive = request.kind === 'live';

  let urlIndex = 0;

  let failedCurrent = false;

  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  let progressTimer: ReturnType<typeof setInterval> | null = null;

  let controls: PlayerControlsHandle | null = null;



  root.innerHTML = '<div class="screen player-screen"></div>';

  const screen = root.querySelector<HTMLElement>('.player-screen')!;



  controls = mountPlayerControls(screen, {
    title: request.title,
    isLive,
    onBack: () => {
      saveProgress();
      appState.goHome(isLive ? 'live' : request.kind === 'series' ? 'series' : 'movies');
    },
    subtitleContext: {
      kind: request.kind,
      languageHints: request.subtitleLanguages ?? [],
      api: appState.api,
      vodStreamId: request.vodStreamId,
    },
  });



  const video = controls.getVideoElement();



  const log = (line: string) => {

    console.log(`[player] ${line}`);

  };



  const clearStallTimer = () => {

    if (stallTimer) clearTimeout(stallTimer);

    stallTimer = null;

  };



  const armStallTimer = () => {

    clearStallTimer();

    if (urlIndex >= urls.length) return;

    stallTimer = setTimeout(() => {

      failCurrentUrl('Playback stalled (timeout).');

    }, STALL_TIMEOUT_MS);

  };



  const applyResumeIfNeeded = () => {

    if (isLive || request.resumePositionMs <= 5000) return;

    const targetSec = request.resumePositionMs / 1000;

    if (video.duration && targetSec >= video.duration - 2) return;

    try {

      video.currentTime = targetSec;

      log(`Resume seek to ${Math.floor(targetSec)}s`);

    } catch {

      /* ignore */

    }

  };



  const loadUrlAtIndex = (index: number) => {

    if (index >= urls.length) {

      controls?.setBuffering(false);

      log('All stream URLs failed.');

      clearStallTimer();

      return;

    }



    urlIndex = index;

    failedCurrent = false;

    const url = urls[index];

    log(`Opening candidate ${index + 1}/${urls.length}: ${url}`);

    controls?.setBuffering(true);



    video.pause();

    video.removeAttribute('src');

    video.src = url;
    video.load();
    controls?.setVideoUrl(url);



    void video.play().catch((err) => {

      log(`play() rejected: ${String(err)}`);

    });



    armStallTimer();

  };



  const failCurrentUrl = (reason: string) => {

    if (failedCurrent || urlIndex >= urls.length) return;

    failedCurrent = true;

    clearStallTimer();

    const code = video.error?.code;

    log(`Stream failed: ${reason}${code != null ? ` (code ${code})` : ''}`);

    loadUrlAtIndex(urlIndex + 1);

  };



  const saveProgress = () => {

    if (!appState.accountKey || isLive) return;

    const accountKey = appState.accountKey;

    const contentKey =

      request.contentKey ??

      (request.vodStreamId != null ? `vod:${request.vodStreamId}` : request.title);



    const entry: WatchHistoryEntry = {

      accountKey,

      contentKey,

      kind: request.kind,

      title: request.title,

      url: urls[urlIndex] ?? request.url,

      fallbackUrls: request.fallbackUrls,

      imageUrl: request.imageUrl,

      positionMs: Math.floor(video.currentTime * 1000),

      durationMs: video.duration ? Math.floor(video.duration * 1000) : null,

      updatedAt: new Date().toISOString(),

      vodStreamId: request.vodStreamId,

      seriesId: request.seriesId,

      episodeId: request.episodeId,

      seriesTitle: request.seriesTitle,

      subtitle: null,

    };

    upsertHistory(entry);

  };



  const onError = () => failCurrentUrl('Media error');

  const onPlaying = () => {

    clearStallTimer();

    controls?.setBuffering(false);

    log('Playback started');

  };

  const onWaiting = () => {

    controls?.setBuffering(true);

    armStallTimer();

  };

  const onLoadedMetadata = () => applyResumeIfNeeded();

  const onEnded = () => {

    if (isLive) failCurrentUrl('Live stream ended unexpectedly');

  };



  video.addEventListener('error', onError);

  video.addEventListener('playing', onPlaying);

  video.addEventListener('waiting', onWaiting);

  video.addEventListener('loadedmetadata', onLoadedMetadata);

  video.addEventListener('ended', onEnded);



  progressTimer = setInterval(() => {

    if (!video.paused && !isLive && video.currentTime > 5) {

      saveProgress();

    }

  }, 15_000);



  void (async () => {

    if (isLive && urls.length > 0) {

      urlIndex = await probeBestStreamIndex(urls, log);

    }

    loadUrlAtIndex(urlIndex);

  })();



  activeCleanup = () => {

    clearStallTimer();

    if (progressTimer) clearInterval(progressTimer);

    video.removeEventListener('error', onError);

    video.removeEventListener('playing', onPlaying);

    video.removeEventListener('waiting', onWaiting);

    video.removeEventListener('loadedmetadata', onLoadedMetadata);

    video.removeEventListener('ended', onEnded);

    controls?.destroy();

    video.pause();

    video.removeAttribute('src');

  };

}


