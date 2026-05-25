import { accountSuccessSummary } from '../api/account-status';
import type { LiveStreamItem, SeriesItem, VodItem } from '../api/xtream';
import {
  entryToPlaybackRequest,
  loadHistory,
  seriesEpisodeContentKey,
  vodContentKey,
  type PlaybackRequest,
} from '../storage/watch-history';
import { appState, type TabId } from '../state/app-state';
import { bindActivate } from '../ui/activate';
import { focusFirst } from '../ui/focus';
import { bindTvSearchFields } from '../utils/search-field';
import {
  contentTileHtml,
  emptyStateHtml,
  errorStateHtml,
  escapeAttr,
  escapeHtml,
  hubRowHtml,
  loadingStateHtml,
  posterCardHtml,
} from '../ui/markup';

const APP_NAME = 'Peders fantastiska IPTV spelare';
const SEARCH_DEBOUNCE_MS = 300;
const MAX_GRID_ITEMS = 300;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function renderHome(root: HTMLElement): void {
  if (appState.screen.name !== 'home') return;
  const tab = appState.screen.tab;
  const accountSummary = appState.accountStatus
    ? accountSuccessSummary(appState.accountStatus)
    : null;

  root.innerHTML = `
    <div class="screen home-screen">
      <header class="app-header" data-focus-zone="header">
        <h1 class="app-header__title">${escapeHtml(APP_NAME)}</h1>
        <button type="button" class="btn icon focusable" id="logout-btn" tabindex="0" aria-label="Log out">
          ${logoutIconSvg()}
        </button>
      </header>
      ${
        accountSummary
          ? `<div class="account-banner" role="status" data-focus-zone="banner">
              <span class="account-banner__icon" aria-hidden="true">${verifiedIconSvg()}</span>
              <span>${escapeHtml(accountSummary)}</span>
            </div>`
          : ''
      }
      <main class="home-body" id="home-main" data-focus-zone="content"></main>
      <nav class="bottom-nav" role="navigation" aria-label="Browse" data-focus-zone="tabs">
        ${bottomNavItem('live', 'Live TV', liveTvIconSvg(), tab)}
        ${bottomNavItem('movies', 'Movies', movieIconSvg(), tab)}
        ${bottomNavItem('series', 'Series', seriesIconSvg(), tab)}
      </nav>
    </div>
  `;

  bindActivate(root.querySelector('#logout-btn') as HTMLElement, () => {
    appState.logout();
  });

  for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    bindActivate(btn, () => {
      appState.setTab(btn.dataset.tab as TabId);
    });
  }

  const main = root.querySelector('#home-main') as HTMLElement;
  if (tab === 'live') {
    renderLiveTab(main);
  } else if (tab === 'movies') {
    renderMoviesTab(main);
  } else {
    renderSeriesTab(main);
  }

  focusFirst(root);
  bindTvSearchFields(root);
}

export function renderHubBrowse(root: HTMLElement): void {
  if (appState.screen.name !== 'hub-browse') return;
  const { tab, rowId } = appState.screen;
  const row = tab === 'movies' ? appState.vodHubRow(rowId) : appState.seriesHubRow(rowId);

  if (!row) {
    root.innerHTML = `
      <div class="screen hub-browse-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="hub-back" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">Browse</h1>
        </header>
        ${emptyStateHtml('This row is no longer available.')}
      </div>
    `;
    bindActivate(root.querySelector('#hub-back') as HTMLElement, () => {
      appState.goHome(tab);
    });
    focusFirst(root);
    return;
  }

  const posters =
    tab === 'movies'
      ? row.items.map((item) => moviePoster(item as VodItem)).join('')
      : row.items.map((item) => seriesPoster(item as SeriesItem)).join('');

  root.innerHTML = `
    <div class="screen hub-browse-screen">
      <header class="app-header">
        <button type="button" class="btn icon focusable" id="hub-back" tabindex="0" aria-label="Back">
          ${backIconSvg()}
        </button>
        <h1 class="app-header__title">${escapeHtml(row.title)}</h1>
      </header>
      ${
        row.items.length === 0
          ? emptyStateHtml('No titles in this row.')
          : `<div class="hub-browse-grid">${posters}</div>`
      }
    </div>
  `;

  bindActivate(root.querySelector('#hub-back') as HTMLElement, () => {
    appState.goHome(tab);
  });

  if (tab === 'movies') {
    bindMoviePosters(root, (id) => row!.items.find((i) => (i as VodItem).streamId === id) as VodItem | undefined);
  } else {
    bindSeriesPosters(root, (id) => row!.items.find((i) => (i as SeriesItem).seriesId === id) as SeriesItem | undefined);
  }

  focusFirst(root);
}

export function renderSeriesDetail(root: HTMLElement): void {
  if (appState.screen.name !== 'series-detail') return;
  const series = appState.screen.series;
  const title = series.name;

  if (appState.seriesDetailLoading) {
    root.innerHTML = `
      <div class="screen series-detail-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">${escapeHtml(title)}</h1>
        </header>
        ${loadingStateHtml('Loading episodes…')}
      </div>
    `;
    bindActivate(root.querySelector('#back-series') as HTMLElement, () => {
      appState.goHome('series');
    });
    focusFirst(root);
    return;
  }

  if (appState.seriesDetailError || !appState.seriesDetail) {
    root.innerHTML = `
      <div class="screen series-detail-screen">
        <header class="app-header">
          <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
            ${backIconSvg()}
          </button>
          <h1 class="app-header__title">${escapeHtml(title)}</h1>
        </header>
        ${errorStateHtml(appState.seriesDetailError ?? 'No data', 'retry-series-detail')}
      </div>
    `;
    bindActivate(root.querySelector('#back-series') as HTMLElement, () => {
      appState.goHome('series');
    });
    bindActivate(root.querySelector('#retry-series-detail') as HTMLElement, () => {
      void appState.loadSeriesDetail(series);
    });
    focusFirst(root);
    return;
  }

  const info = appState.seriesDetail;
  const seasons = Object.keys(info.episodes).sort(
    (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
  );

  let episodesHtml = '';
  for (const season of seasons) {
    const eps = info.episodes[season] ?? [];
    episodesHtml += `<section class="season-block"><h3>Season ${escapeHtml(season)}</h3><div class="episode-list">`;
    for (const ep of eps) {
      episodesHtml += `<button type="button" class="episode-item focusable" tabindex="0"
        data-episode-id="${ep.id}" data-season="${escapeAttr(season)}">${escapeHtml(ep.title)}</button>`;
    }
    episodesHtml += '</div></section>';
  }

  root.innerHTML = `
    <div class="screen series-detail-screen">
      <header class="app-header">
        <button type="button" class="btn icon focusable" id="back-series" tabindex="0" aria-label="Back">
          ${backIconSvg()}
        </button>
        <h1 class="app-header__title">${escapeHtml(title)}</h1>
      </header>
      <div class="series-detail-body">
        ${info.info.plot ? `<p class="series-plot">${escapeHtml(info.info.plot)}</p>` : ''}
        <div class="series-episodes">${episodesHtml}</div>
      </div>
    </div>
  `;

  bindActivate(root.querySelector('#back-series') as HTMLElement, () => {
    appState.goHome('series');
  });

  for (const btn of root.querySelectorAll('[data-episode-id]')) {
    bindActivate(btn as HTMLElement, () => {
      const episodeId = parseInt((btn as HTMLElement).dataset.episodeId ?? '0', 10);
      const season = (btn as HTMLElement).dataset.season ?? '';
      const ep = info.episodes[season]?.find((e) => e.id === episodeId);
      if (!ep || !appState.api) return;
      const req: PlaybackRequest = {
        title: `${title} · ${ep.title}`,
        url: appState.api.buildEpisodeUrl(ep),
        fallbackUrls: [],
        kind: 'series',
        streamId: null,
        contentKey: seriesEpisodeContentKey(series.seriesId, episodeId),
        imageUrl: series.cover,
        resumePositionMs: 0,
        vodStreamId: null,
        seriesId: series.seriesId,
        episodeId,
        seriesTitle: title,
      };
      appState.openPlayer(req);
    });
  }

  focusFirst(root);
}

function renderLiveTab(main: HTMLElement): void {
  if (appState.liveLoading && appState.liveCategories.length === 0) {
    main.innerHTML = loadingStateHtml('Loading categories…');
    return;
  }
  if (appState.liveError) {
    main.innerHTML = errorStateHtml(appState.liveError, 'retry-live');
    bindActivate(main.querySelector('#retry-live') as HTMLElement, () => {
      void appState.loadLive();
    });
    return;
  }

  const items = appState.filteredLiveItems();
  main.innerHTML = `
    <div class="browse-layout">
      <aside class="category-sidebar" data-focus-zone="sidebar">
        <ul class="category-list" id="category-list">
          ${appState.liveCategories
            .map(
              (c) => `
            <li>
              <button type="button" class="category-item focusable ${
                appState.liveSelectedCategory?.categoryId === c.categoryId
                  ? 'category-item--active'
                  : ''
              }" data-category-id="${escapeAttr(c.categoryId)}" tabindex="0">
                ${escapeHtml(c.categoryName)}
              </button>
            </li>`,
            )
            .join('')}
        </ul>
      </aside>
      <section class="content-panel" data-focus-zone="catalog">
        ${hubSearchField('live-search', 'Search channels…', appState.liveSearchQuery)}
        ${
          appState.liveLoading
            ? loadingStateHtml('Loading channels…')
            : items.length === 0
              ? emptyStateHtml('No channels in this category.')
              : `<div class="live-grid" id="live-grid">
                  ${items
                    .slice(0, MAX_GRID_ITEMS)
                    .map((item) =>
                      contentTileHtml({
                        title: item.name,
                        imageUrl: item.streamIcon,
                        attrs: `data-stream-id="${item.streamId}" data-kind="live"`,
                      }),
                    )
                    .join('')}
                </div>`
        }
      </section>
    </div>
  `;

  const searchInput = main.querySelector<HTMLInputElement>('#live-search');
  if (searchInput) {
    bindDebouncedSearch(searchInput, 'live', (query) => {
      void appState.setLiveSearch(query);
    });
  }

  for (const btn of main.querySelectorAll('[data-category-id]')) {
    bindActivate(btn as HTMLElement, () => {
      const id = (btn as HTMLElement).dataset.categoryId!;
      const cat = appState.liveCategories.find((c) => c.categoryId === id);
      if (cat) void appState.selectLiveCategory(cat);
    });
  }

  bindGridPlayback(main, (el) => {
    const id = parseInt(el.dataset.streamId ?? '0', 10);
    const item = appState.filteredLiveItems().find((i) => i.streamId === id);
    return item ? livePlaybackRequest(item) : null;
  });
}

function renderMoviesTab(main: HTMLElement): void {
  if (appState.vodLoading && appState.vodHubRows.length === 0) {
    main.innerHTML = loadingStateHtml('Loading catalog…');
    return;
  }
  if (appState.vodError) {
    main.innerHTML = errorStateHtml(appState.vodError, 'retry-vod');
    bindActivate(main.querySelector('#retry-vod') as HTMLElement, () => {
      void appState.loadMovies();
    });
    return;
  }

  const isSearching = appState.vodSearchQuery.trim().length > 0;
  main.innerHTML = `
    <div class="hub-scroll" data-focus-zone="hub">
      ${hubSearchField('vod-search', 'Search movies by title or genre…', appState.vodSearchQuery)}
      ${
        isSearching
          ? renderMoviesSearchResults()
          : renderMoviesHubBrowse()
      }
    </div>
  `;

  const searchInput = main.querySelector<HTMLInputElement>('#vod-search');
  if (searchInput) {
    bindDebouncedSearch(searchInput, 'vod', (query) => {
      appState.setVodSearch(query);
    });
  }

  if (isSearching) {
    bindMoviePosters(main, (id) => appState.filteredVodItems().find((i) => i.streamId === id));
  } else {
    bindRecentlyWatched(main, 'vod');
    bindSeeAll(main, 'movies');
    bindMoviePosters(main, (id) => findVodItem(id));
  }
}

function renderSeriesTab(main: HTMLElement): void {
  if (appState.seriesLoading && appState.seriesHubRows.length === 0) {
    main.innerHTML = loadingStateHtml('Loading catalog…');
    return;
  }
  if (appState.seriesError) {
    main.innerHTML = errorStateHtml(appState.seriesError, 'retry-series');
    bindActivate(main.querySelector('#retry-series') as HTMLElement, () => {
      void appState.loadSeriesList();
    });
    return;
  }

  const isSearching = appState.seriesSearchQuery.trim().length > 0;
  main.innerHTML = `
    <div class="hub-scroll" data-focus-zone="hub">
      ${hubSearchField('series-search', 'Search series by title, cast, or genre…', appState.seriesSearchQuery)}
      ${
        isSearching
          ? renderSeriesSearchResults()
          : renderSeriesHubBrowse()
      }
    </div>
  `;

  const searchInput = main.querySelector<HTMLInputElement>('#series-search');
  if (searchInput) {
    bindDebouncedSearch(searchInput, 'series', (query) => {
      appState.setSeriesSearch(query);
    });
  }

  if (isSearching) {
    bindSeriesPosters(main, (id) => appState.filteredSeriesItems().find((i) => i.seriesId === id));
  } else {
    bindRecentlyWatched(main, 'series');
    bindSeeAll(main, 'series');
    bindSeriesPosters(main, (id) => findSeriesItem(id));
  }
}

function renderMoviesSearchResults(): string {
  const items = appState.filteredVodItems().slice(0, MAX_GRID_ITEMS);
  if (items.length === 0) {
    return emptyStateHtml('No movies match your search.');
  }
  return `<div class="hub-search-grid">
    ${items.map((item) => moviePoster(item)).join('')}
  </div>`;
}

function renderSeriesSearchResults(): string {
  const items = appState.filteredSeriesItems().slice(0, MAX_GRID_ITEMS);
  if (items.length === 0) {
    return emptyStateHtml('No series match your search.');
  }
  return `<div class="hub-search-grid">
    ${items.map((item) => seriesPoster(item)).join('')}
  </div>`;
}

function renderMoviesHubBrowse(): string {
  const history = recentlyWatchedEntries('vod');
  const rowsHtml = appState.vodHubRows
    .map((row) =>
      hubRowHtml(
        row.title,
        row.id,
        row.items.map((item) => moviePoster(item)).join(''),
        row.items.length,
      ),
    )
    .join('');

  if (history.length === 0 && rowsHtml === '') {
    if (appState.vodLoadingGenres) {
      return `<p class="status-msg">Loading genres from your library…</p>`;
    }
    return emptyStateHtml('No movies found.');
  }

  const loadingGenres =
    appState.vodLoadingGenres && appState.vodHubRows.length === 0
      ? `<p class="status-msg">Loading genres from your library…</p>`
      : '';

  return `${recentlyWatchedSection(history)}${loadingGenres}${rowsHtml}`;
}

function renderSeriesHubBrowse(): string {
  const history = recentlyWatchedEntries('series');
  const rowsHtml = appState.seriesHubRows
    .map((row) =>
      hubRowHtml(
        row.title,
        row.id,
        row.items.map((item) => seriesPoster(item)).join(''),
        row.items.length,
      ),
    )
    .join('');

  if (history.length === 0 && rowsHtml === '') {
    return emptyStateHtml('No series found.');
  }

  return `${recentlyWatchedSection(history)}${rowsHtml}`;
}

function recentlyWatchedSection(
  entries: ReturnType<typeof loadHistory>,
): string {
  if (entries.length === 0) return '';
  const posters = entries
    .map((entry) => {
      const progress =
        entry.durationMs != null && entry.durationMs > 0
          ? entry.positionMs / entry.durationMs
          : undefined;
      return posterCardHtml({
        title: entry.title,
        imageUrl: entry.imageUrl,
        placeholderIcon: entry.kind === 'vod' ? '🎬' : '📺',
        progress,
        attrs: `data-resume-key="${escapeAttr(entry.contentKey)}"`,
      });
    })
    .join('');

  return `
    <section class="hub-row">
      <div class="content-row">
        <h2 class="content-row__title">Recently watched</h2>
      </div>
      <div class="horizontal-poster-row-clip"><div class="horizontal-poster-row">${posters}</div></div>
    </section>
  `;
}

function recentlyWatchedEntries(kind: 'vod' | 'series') {
  if (!appState.accountKey) return [];
  return loadHistory(appState.accountKey).filter((e) => e.kind === kind);
}

function hubSearchField(id: string, placeholder: string, value: string): string {
  const display = value.trim() || placeholder;
  const isPlaceholder = !value.trim();
  return `
    <div class="search-field-wrap hub-search-wrap">
      <button type="button" class="search-field search-field--tv focusable" tabindex="0"
        data-search-input="${escapeAttr(id)}" aria-label="${escapeAttr(placeholder)}">
        <span class="search-field__icon">⌕</span>
        <span class="search-field__text${isPlaceholder ? ' search-field__text--placeholder' : ''}">${escapeHtml(display)}</span>
      </button>
      <input type="search" id="${escapeAttr(id)}" class="search-field__input" tabindex="-1"
        readonly placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}" />
    </div>
  `;
}

function bottomNavItem(id: TabId, label: string, icon: string, active: TabId): string {
  const isActive = id === active;
  return `
    <button type="button" class="nav-item focusable ${isActive ? 'nav-item--active' : ''}"
      data-tab="${id}" tabindex="0" aria-current="${isActive ? 'page' : 'false'}">
      <span class="nav-item__icon">${icon}</span>
      <span class="nav-item__label">${escapeHtml(label)}</span>
    </button>
  `;
}

function moviePoster(item: VodItem): string {
  return posterCardHtml({
    title: item.name,
    imageUrl: item.streamIcon,
    placeholderIcon: '🎬',
    attrs: `data-stream-id="${item.streamId}" data-kind="vod"`,
  });
}

function seriesPoster(item: SeriesItem): string {
  return posterCardHtml({
    title: item.name,
    imageUrl: item.cover,
    placeholderIcon: '📺',
    attrs: `data-series-id="${item.seriesId}"`,
  });
}

function findVodItem(streamId: number): VodItem | undefined {
  for (const row of appState.vodHubRows) {
    const item = row.items.find((i) => i.streamId === streamId);
    if (item) return item;
  }
  return appState.vodAllMovies.find((i) => i.streamId === streamId);
}

function findSeriesItem(seriesId: number): SeriesItem | undefined {
  for (const row of appState.seriesHubRows) {
    const item = row.items.find((i) => i.seriesId === seriesId);
    if (item) return item;
  }
  return appState.seriesAllItems.find((i) => i.seriesId === seriesId);
}

function livePlaybackRequest(item: LiveStreamItem): PlaybackRequest | null {
  if (!appState.api) return null;
  const urls = appState.api.buildLiveStreamUrlCandidates(item);
  return {
    title: item.name,
    url: urls[0],
    fallbackUrls: urls.slice(1),
    kind: 'live',
    streamId: item.streamId,
    contentKey: null,
    imageUrl: item.streamIcon,
    resumePositionMs: 0,
    vodStreamId: null,
    seriesId: null,
    episodeId: null,
    seriesTitle: null,
  };
}

function vodPlaybackRequest(item: VodItem): PlaybackRequest | null {
  if (!appState.api) return null;
  return {
    title: item.name,
    url: appState.api.buildVodUrl(item),
    fallbackUrls: [],
    kind: 'vod',
    streamId: item.streamId,
    contentKey: vodContentKey(item.streamId),
    imageUrl: item.streamIcon,
    resumePositionMs: 0,
    vodStreamId: item.streamId,
    seriesId: null,
    episodeId: null,
    seriesTitle: null,
  };
}

function bindDebouncedSearch(
  input: HTMLInputElement,
  key: string,
  onSearch: (query: string) => void | Promise<void>,
): void {
  input.addEventListener('input', () => {
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        void onSearch(input.value);
      }, SEARCH_DEBOUNCE_MS),
    );
  });
}

function bindGridPlayback(
  container: HTMLElement,
  buildRequest: (el: HTMLElement) => PlaybackRequest | null,
): void {
  for (const el of container.querySelectorAll('[data-stream-id][data-kind="live"]')) {
    bindActivate(el as HTMLElement, () => {
      const req = buildRequest(el as HTMLElement);
      if (req) appState.openPlayer(req);
    });
  }
}

function bindMoviePosters(
  container: HTMLElement,
  resolveItem: (streamId: number) => VodItem | undefined,
): void {
  for (const el of container.querySelectorAll('[data-stream-id][data-kind="vod"]')) {
    bindActivate(el as HTMLElement, () => {
      const id = parseInt((el as HTMLElement).dataset.streamId ?? '0', 10);
      const item = resolveItem(id);
      if (!item) return;
      const req = vodPlaybackRequest(item);
      if (req) appState.openPlayer(req);
    });
  }
}

function bindSeriesPosters(
  container: HTMLElement,
  resolveItem: (seriesId: number) => SeriesItem | undefined,
): void {
  for (const el of container.querySelectorAll('[data-series-id]')) {
    bindActivate(el as HTMLElement, () => {
      const id = parseInt((el as HTMLElement).dataset.seriesId ?? '0', 10);
      const series = resolveItem(id);
      if (series) appState.openSeriesDetail(series);
    });
  }
}

function bindSeeAll(container: HTMLElement, tab: 'movies' | 'series'): void {
  for (const btn of container.querySelectorAll('[data-see-all]')) {
    bindActivate(btn as HTMLElement, () => {
      const rowId = (btn as HTMLElement).dataset.seeAll!;
      appState.openHubBrowse(tab, rowId);
    });
  }
}

function bindRecentlyWatched(container: HTMLElement, kind: 'vod' | 'series'): void {
  const history = recentlyWatchedEntries(kind);
  for (const el of container.querySelectorAll('[data-resume-key]')) {
    bindActivate(el as HTMLElement, () => {
      const key = (el as HTMLElement).dataset.resumeKey!;
      const entry = history.find((h) => h.contentKey === key);
      if (entry) appState.openPlayer(entryToPlaybackRequest(entry));
    });
  }
}

function logoutIconSvg(): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>`;
}

function backIconSvg(): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
}

function verifiedIconSvg(): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`;
}

function liveTvIconSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`;
}

function movieIconSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`;
}

function seriesIconSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>`;
}
