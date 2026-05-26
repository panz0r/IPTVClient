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
import { captureFocus, focusFirst, restoreFocus } from '../ui/focus';
import {
  bindTvSearchFields,
  captureSearchEditorState,
  reopenSearchEditor,
  runWithSearchBlurSuppressed,
} from '../utils/search-field';
import {
  consumePendingHubRowFocusKey,
  hubRowPosterSlice,
  scrollPosterIntoView,
} from '../utils/hub-row-nav';
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
let lastHomeAccountSummary: string | null | undefined;

export function renderHome(root: HTMLElement): void {
  if (appState.screen.name !== 'home') {
    lastHomeAccountSummary = undefined;
    return;
  }

  const tab = appState.screen.tab;
  const accountSummary = appState.accountStatus
    ? accountSuccessSummary(appState.accountStatus)
    : null;

  const shell = root.querySelector('.home-screen');
  if (!shell || lastHomeAccountSummary !== accountSummary) {
    root.innerHTML = buildHomeShellHtml(tab, accountSummary);
    bindHomeShellEvents(root);
    lastHomeAccountSummary = accountSummary;
  } else {
    updateBottomNavActive(root, tab);
  }

  const main = root.querySelector('#home-main') as HTMLElement;
  bindHomeMainDelegation(main);

  const searchEditor = captureSearchEditorState(root);
  const focusToken = searchEditor ? null : captureFocus(root);

  runWithSearchBlurSuppressed(() => {
    if (tab === 'live') {
      renderLiveTab(main);
    } else if (tab === 'movies') {
      renderMoviesTab(main);
    } else {
      renderSeriesTab(main);
    }
  });

  bindTvSearchFields(main);
  const pendingRowFocus = consumePendingHubRowFocusKey();
  if (pendingRowFocus) {
    const el = findByFocusKey(main, pendingRowFocus);
    if (el) {
      el.focus();
      scrollPosterIntoView(el);
    }
  } else if (searchEditor) {
    reopenSearchEditor(main, searchEditor);
  } else {
    restoreFocus(root, focusToken);
  }
}

function findByFocusKey(container: HTMLElement, focusKey: string): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('[data-focus-key]')) {
    if (el.dataset.focusKey === focusKey) return el;
  }
  return null;
}

function buildHomeShellHtml(tab: TabId, accountSummary: string | null): string {
  return `
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
}

function bindHomeShellEvents(root: HTMLElement): void {
  bindActivate(root.querySelector('#logout-btn') as HTMLElement, () => {
    appState.logout();
  });

  for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    bindActivate(btn, () => {
      appState.setTab(btn.dataset.tab as TabId);
    });
  }
}

function updateBottomNavActive(root: HTMLElement, tab: TabId): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('nav-item--active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  }
}

function bindHomeMainDelegation(main: HTMLElement): void {
  if (main.dataset.delegateBound === '1') return;
  main.dataset.delegateBound = '1';

  main.addEventListener('click', (event) => {
    handleHomeMainActivate(event.target, false);
  });

  main.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const code = event.keyCode;
    if (code !== 13 && code !== 28 && event.key !== 'Enter') return;
    if (handleHomeMainActivate(event.target, true)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  main.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('search-field__input')) {
      return;
    }
    const key = input.id;
    if (!key) return;
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        if (key === 'live-search') void appState.setLiveSearch(input.value);
        else if (key === 'vod-search') appState.setVodSearch(input.value);
        else if (key === 'series-search') appState.setSeriesSearch(input.value);
      }, SEARCH_DEBOUNCE_MS),
    );
  });
}

function handleHomeMainActivate(target: EventTarget | null, fromKey: boolean): boolean {
  if (!(target instanceof Element)) return false;

  const retry = target.closest('[id^="retry-"]') as HTMLElement | null;
  if (retry) {
    if (retry.id === 'retry-live') void appState.loadLive();
    else if (retry.id === 'retry-vod') void appState.loadMovies();
    else if (retry.id === 'retry-series') void appState.loadSeriesList();
    return true;
  }

  const category = target.closest('[data-category-id]') as HTMLElement | null;
  if (category) {
    const id = category.dataset.categoryId!;
    const cat = appState.liveCategories.find((c) => c.categoryId === id);
    if (cat) void appState.selectLiveCategory(cat);
    return true;
  }

  const liveTile = target.closest('[data-stream-id][data-kind="live"]') as HTMLElement | null;
  if (liveTile) {
    const streamId = parseInt(liveTile.dataset.streamId ?? '0', 10);
    const item = appState.filteredLiveItems().find((i) => i.streamId === streamId);
    const req = item ? livePlaybackRequest(item) : null;
    if (req) appState.openPlayer(req);
    return true;
  }

  const vodTile = target.closest('[data-stream-id][data-kind="vod"]') as HTMLElement | null;
  if (vodTile) {
    const streamId = parseInt(vodTile.dataset.streamId ?? '0', 10);
    const item =
      appState.filteredVodItems().find((i) => i.streamId === streamId) ??
      findVodItem(streamId);
    if (item) {
      const req = vodPlaybackRequest(item);
      if (req) appState.openPlayer(req);
    }
    return true;
  }

  const seriesTile = target.closest('[data-series-id]') as HTMLElement | null;
  if (seriesTile) {
    const seriesId = parseInt(seriesTile.dataset.seriesId ?? '0', 10);
    const series =
      appState.filteredSeriesItems().find((i) => i.seriesId === seriesId) ??
      findSeriesItem(seriesId);
    if (series) appState.openSeriesDetail(series);
    return true;
  }

  const seeAll = target.closest('[data-see-all]') as HTMLElement | null;
  if (seeAll) {
    const rowId = seeAll.dataset.seeAll!;
    const tab = appState.screen.name === 'home' ? appState.screen.tab : 'movies';
    if (tab === 'movies' || tab === 'series') appState.openHubBrowse(tab, rowId);
    return true;
  }

  const resume = target.closest('[data-resume-key]') as HTMLElement | null;
  if (resume && appState.accountKey) {
    const key = resume.dataset.resumeKey!;
    const entry = loadHistory(appState.accountKey).find((h) => h.contentKey === key);
    if (entry) appState.openPlayer(entryToPlaybackRequest(entry));
    return true;
  }

  return fromKey;
}

export function bindAppScreenDelegation(appRoot: HTMLElement): void {
  if (appRoot.dataset.appDelegateBound === '1') return;
  appRoot.dataset.appDelegateBound = '1';

  appRoot.addEventListener('click', (event) => {
    handleAppScreenActivate(event.target);
  });

  appRoot.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const code = event.keyCode;
    if (code !== 13 && code !== 28 && event.key !== 'Enter') return;
    if (handleAppScreenActivate(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

function handleAppScreenActivate(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const hubBack = target.closest('#hub-back');
  if (hubBack && appState.screen.name === 'hub-browse') {
    appState.goHome(appState.screen.tab);
    return true;
  }

  const seriesBack = target.closest('#back-series');
  if (seriesBack) {
    appState.goHome('series');
    return true;
  }

  const retryDetail = target.closest('#retry-series-detail');
  if (retryDetail && appState.screen.name === 'series-detail') {
    void appState.loadSeriesDetail(appState.screen.series);
    return true;
  }

  if (appState.screen.name === 'hub-browse') {
    const { tab, rowId } = appState.screen;
    const row = tab === 'movies' ? appState.vodHubRow(rowId) : appState.seriesHubRow(rowId);
    if (!row) return false;

    const vodTile = target.closest('[data-stream-id][data-kind="vod"]') as HTMLElement | null;
    if (vodTile && tab === 'movies') {
      const streamId = parseInt(vodTile.dataset.streamId ?? '0', 10);
      const item = row.items.find((i) => (i as VodItem).streamId === streamId) as VodItem | undefined;
      if (item) {
        const req = vodPlaybackRequest(item);
        if (req) appState.openPlayer(req);
      }
      return true;
    }

    const seriesTile = target.closest('[data-series-id]') as HTMLElement | null;
    if (seriesTile && tab === 'series') {
      const seriesId = parseInt(seriesTile.dataset.seriesId ?? '0', 10);
      const series = row.items.find((i) => (i as SeriesItem).seriesId === seriesId) as
        | SeriesItem
        | undefined;
      if (series) appState.openSeriesDetail(series);
      return true;
    }
  }

  if (appState.screen.name === 'series-detail' && appState.seriesDetail) {
    const episodeBtn = target.closest('[data-episode-id]') as HTMLElement | null;
    if (episodeBtn && appState.api) {
      const series = appState.screen.series;
      const episodeId = parseInt(episodeBtn.dataset.episodeId ?? '0', 10);
      const season = episodeBtn.dataset.season ?? '';
      const ep = appState.seriesDetail.episodes[season]?.find((e) => e.id === episodeId);
      if (ep) {
        const req: PlaybackRequest = {
          title: `${series.name} · ${ep.title}`,
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
          seriesTitle: series.name,
          subtitleLanguages: ep.subtitles,
        };
        appState.openPlayer(req);
      }
      return true;
    }
  }

  return false;
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
    focusFirst(root);
    return;
  }

  const visibleItems = row.items.slice(0, MAX_GRID_ITEMS);
  const posters =
    tab === 'movies'
      ? visibleItems.map((item) => moviePoster(item as VodItem, `${rowId}:${item.streamId}`)).join('')
      : visibleItems.map((item) => seriesPoster(item as SeriesItem, `${rowId}:${item.seriesId}`)).join('');

  const focusToken = captureFocus(root);
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

  restoreFocus(root, focusToken);
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

  const focusToken = captureFocus(root);
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

  restoreFocus(root, focusToken);
}

function renderLiveTab(main: HTMLElement): void {
  if (appState.liveLoading && appState.liveCategories.length === 0) {
    main.innerHTML = loadingStateHtml('Loading categories…');
    return;
  }
  if (appState.liveError) {
    main.innerHTML = errorStateHtml(appState.liveError, 'retry-live');
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
        <div class="catalog-search-bar" data-focus-zone="hub-search">
          ${hubSearchField('live-search', 'Search channels…', appState.liveSearchQuery)}
        </div>
        <div class="catalog-scroll">
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
        </div>
      </section>
    </div>
  `;
}

function renderMoviesTab(main: HTMLElement): void {
  if (appState.vodLoading && appState.vodHubRows.length === 0) {
    main.innerHTML = loadingStateHtml('Loading catalog…');
    return;
  }
  if (appState.vodError) {
    main.innerHTML = errorStateHtml(appState.vodError, 'retry-vod');
    return;
  }

  const isSearching = appState.vodSearchQuery.trim().length > 0;
  main.innerHTML = `
    <div class="hub-layout" data-focus-zone="hub">
      <div class="hub-search-bar" data-focus-zone="hub-search">
        ${hubSearchField('vod-search', 'Search movies by title or genre…', appState.vodSearchQuery)}
      </div>
      <div class="hub-scroll">
      ${
        isSearching
          ? renderMoviesSearchResults()
          : renderMoviesHubBrowse()
      }
      </div>
    </div>
  `;
}

function renderSeriesTab(main: HTMLElement): void {
  if (appState.seriesLoading && appState.seriesHubRows.length === 0) {
    main.innerHTML = loadingStateHtml('Loading catalog…');
    return;
  }
  if (appState.seriesError) {
    main.innerHTML = errorStateHtml(appState.seriesError, 'retry-series');
    return;
  }

  const isSearching = appState.seriesSearchQuery.trim().length > 0;
  main.innerHTML = `
    <div class="hub-layout" data-focus-zone="hub">
      <div class="hub-search-bar" data-focus-zone="hub-search">
        ${hubSearchField('series-search', 'Search series by title, cast, or genre…', appState.seriesSearchQuery)}
      </div>
      <div class="hub-scroll">
      ${
        isSearching
          ? renderSeriesSearchResults()
          : renderSeriesHubBrowse()
      }
      </div>
    </div>
  `;
}

function renderMoviesSearchResults(): string {
  const items = appState.filteredVodItems().slice(0, MAX_GRID_ITEMS);
  if (items.length === 0) {
    return emptyStateHtml('No movies match your search.');
  }
  return `<div class="hub-search-grid">
    ${items.map((item) => moviePoster(item, `search:vod:${item.streamId}`)).join('')}
  </div>`;
}

function renderSeriesSearchResults(): string {
  const items = appState.filteredSeriesItems().slice(0, MAX_GRID_ITEMS);
  if (items.length === 0) {
    return emptyStateHtml('No series match your search.');
  }
  return `<div class="hub-search-grid">
    ${items.map((item) => seriesPoster(item, `search:series:${item.seriesId}`)).join('')}
  </div>`;
}

function renderMoviesHubBrowse(): string {
  const history = recentlyWatchedEntries('vod');
  const rowsHtml = appState.vodHubRows
    .map((row) =>
      hubRowHtml(
        row.title,
        row.id,
        hubRowPosterSlice(row.id, row.items)
          .map((item) => moviePoster(item, `${row.id}:${item.streamId}`))
          .join(''),
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
        hubRowPosterSlice(row.id, row.items)
          .map((item) => seriesPoster(item, `${row.id}:${item.seriesId}`))
          .join(''),
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
        attrs:
          `data-focus-key="recent:${escapeAttr(entry.contentKey)}" ` +
          `data-resume-key="${escapeAttr(entry.contentKey)}"`,
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

function moviePoster(item: VodItem, focusKey?: string): string {
  const key = focusKey ?? `vod:${item.streamId}`;
  return posterCardHtml({
    title: item.name,
    imageUrl: item.streamIcon,
    placeholderIcon: '🎬',
    attrs:
      `data-focus-key="${escapeAttr(key)}" ` +
      `data-stream-id="${item.streamId}" data-kind="vod"`,
  });
}

function seriesPoster(item: SeriesItem, focusKey?: string): string {
  const key = focusKey ?? `series:${item.seriesId}`;
  return posterCardHtml({
    title: item.name,
    imageUrl: item.cover,
    placeholderIcon: '📺',
    attrs:
      `data-focus-key="${escapeAttr(key)}" ` +
      `data-series-id="${item.seriesId}"`,
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
    subtitleLanguages: [],
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
    subtitleLanguages: [],
  };
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
