import {
  upsertHistory,
  type PlaybackRequest,
  type WatchHistoryEntry,
} from '../storage/watch-history';
import { appState } from '../state/app-state';
import { focusFirst } from '../ui/focus';

let activeCleanup: (() => void) | null = null;

export function renderPlayer(
  root: HTMLElement,
  request: PlaybackRequest,
): void {
  activeCleanup?.();
  activeCleanup = null;

  const urls = [request.url, ...request.fallbackUrls];
  let urlIndex = 0;
  const log: string[] = [
    '=== Playback debug ===',
    `Title: ${request.title}`,
    `Kind: ${request.kind}`,
    ...urls.map((u, i) => `  ${i + 1}. ${u}`),
    '',
  ];

  root.innerHTML = `
    <div class="screen player-screen">
      <video id="player-video" class="player-video" autoplay></video>
      <div class="player-overlay">
        <h2 class="player-title">${escapeHtml(request.title)}</h2>
        <p class="player-status" id="player-status">Loading…</p>
        <div class="player-actions">
          <button type="button" class="btn focusable" id="player-back" tabindex="0">Back</button>
          <button type="button" class="btn focusable" id="toggle-debug" tabindex="0">Debug log</button>
        </div>
        <pre class="player-debug hidden" id="player-debug"></pre>
      </div>
    </div>
  `;

  const video = root.querySelector<HTMLVideoElement>('#player-video')!;
  const statusEl = root.querySelector('#player-status')!;
  const debugEl = root.querySelector<HTMLPreElement>('#player-debug')!;

  const appendLog = (line: string) => {
    log.push(line);
    debugEl.textContent = log.join('\n');
  };

  const setStatus = (text: string) => {
    statusEl.textContent = text;
  };

  const tryNextUrl = () => {
    if (urlIndex >= urls.length) {
      setStatus('All stream URLs failed.');
      appendLog('Result: FAILED (exhausted candidates)');
      return;
    }
    const url = urls[urlIndex];
    urlIndex += 1;
    appendLog(`Trying URL ${urlIndex}/${urls.length}: ${url}`);
    setStatus(`Loading stream ${urlIndex}/${urls.length}…`);

    video.pause();
    video.removeAttribute('src');
    while (video.firstChild) {
      video.removeChild(video.firstChild);
    }

    const source = document.createElement('source');
    source.src = url;
    if (url.includes('.m3u8')) {
      source.type = 'application/vnd.apple.mpegurl';
    } else if (url.includes('.ts')) {
      source.type = 'video/mp2t';
    } else {
      source.type = 'video/mp4';
    }

    if (request.resumePositionMs > 5000 && request.kind !== 'live') {
      const options = {
        option: {
          transmission: {
            playTime: { start: request.resumePositionMs },
          },
        },
      };
      source.type = `${source.type};mediaOption=${encodeURIComponent(JSON.stringify(options))}`;
    }

    video.appendChild(source);
    video.load();
    void video.play().catch((err) => {
      appendLog(`play() rejected: ${String(err)}`);
    });
  };

  const onError = () => {
    appendLog(`media error on URL ${urlIndex}`);
    tryNextUrl();
  };

  const onPlaying = () => {
    setStatus('Playing');
    appendLog('Playback started');
  };

  const onWaiting = () => setStatus('Buffering…');

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  const saveProgress = () => {
    if (!appState.accountKey || request.kind === 'live') return;
    const accountKey = appState.accountKey;
    const contentKey =
      request.contentKey ??
      (request.vodStreamId != null ? `vod:${request.vodStreamId}` : request.title);

    const entry: WatchHistoryEntry = {
      accountKey,
      contentKey,
      kind: request.kind,
      title: request.title,
      url: request.url,
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

  video.addEventListener('error', onError);
  video.addEventListener('playing', onPlaying);
  video.addEventListener('waiting', onWaiting);

  progressTimer = setInterval(() => {
    if (!video.paused && request.kind !== 'live' && video.currentTime > 5) {
      saveProgress();
    }
  }, 15_000);

  root.querySelector('#player-back')?.addEventListener('click', () => {
    saveProgress();
    appState.goHome('live');
  });

  root.querySelector('#toggle-debug')?.addEventListener('click', () => {
    debugEl.classList.toggle('hidden');
  });

  debugEl.textContent = log.join('\n');
  tryNextUrl();
  focusFirst(root);

  activeCleanup = () => {
    if (progressTimer) clearInterval(progressTimer);
    video.removeEventListener('error', onError);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('waiting', onWaiting);
    video.pause();
    while (video.firstChild) video.removeChild(video.firstChild);
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
