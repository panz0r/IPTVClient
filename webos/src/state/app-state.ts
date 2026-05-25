import {
  XtreamApi,
  type AccountStatus,
  type Category,
  type LiveStreamItem,
  type SeriesInfo,
  type SeriesItem,
  type VodItem,
  type XtreamCredentials,
} from '../api/xtream';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '../storage/credentials-store';
import { accountKeyFor } from '../storage/watch-history';
import { filterByTitle } from '../utils/content-search';
import { groupByGenre } from '../utils/genre-grouper';
import { dismissTvKeyboard } from '../utils/keyboard';
import { indexMissingVodGenres } from '../services/vod-genre-indexer';
import { loadVodGenreCache } from '../storage/vod-genre-cache';
import type { HubContentRow } from '../models/hub-row';

export type TabId = 'live' | 'movies' | 'series';

export type Screen =
  | { name: 'login' }
  | { name: 'home'; tab: TabId }
  | { name: 'hub-browse'; tab: 'movies' | 'series'; rowId: string }
  | { name: 'series-detail'; series: SeriesItem }
  | { name: 'player'; request: import('../storage/watch-history').PlaybackRequest };

type Listener = () => void;

export class AppState {
  screen: Screen = { name: 'login' };
  api: XtreamApi | null = null;
  accountKey: string | null = null;
  accountStatus: AccountStatus | null = null;
  loginError: string | null = null;
  loginDebugLog = '';
  isLoggingIn = false;

  // Live browse
  liveCategories: Category[] = [];
  liveSelectedCategory: Category | null = null;
  liveItems: LiveStreamItem[] = [];
  liveAllItems: LiveStreamItem[] = [];
  liveSearchQuery = '';
  liveLoading = false;
  liveError: string | null = null;

  // Movies hub
  vodHubRows: HubContentRow<VodItem>[] = [];
  vodAllMovies: VodItem[] = [];
  vodGenreByStreamId: Record<number, string> = {};
  vodSearchQuery = '';
  vodLoading = false;
  vodLoadingGenres = false;
  vodError: string | null = null;
  private vodGenreIndexGeneration = 0;

  // Series hub
  seriesHubRows: HubContentRow<SeriesItem>[] = [];
  seriesAllItems: SeriesItem[] = [];
  seriesSearchQuery = '';
  seriesLoading = false;
  seriesError: string | null = null;
  seriesDetail: SeriesInfo | null = null;
  seriesDetailLoading = false;
  seriesDetailError: string | null = null;

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }

  async tryAutoLogin(): Promise<void> {
    const creds = loadCredentials();
    if (!creds) {
      this.screen = { name: 'login' };
      this.notify();
      return;
    }
    await this.login(creds, creds.serverUrl);
  }

  async login(
    credentials: XtreamCredentials,
    originalServerInput?: string,
  ): Promise<void> {
    this.isLoggingIn = true;
    this.loginError = null;
    this.loginDebugLog = '';
    this.notify();

    const api = new XtreamApi(credentials);
    const result = await api.authenticateWithDebug(originalServerInput);
    this.loginDebugLog = result.debugLog;
    this.isLoggingIn = false;

    if (!result.success) {
      this.loginError = result.summary ?? 'Login failed.';
      this.api = null;
      this.notify();
      return;
    }

    saveCredentials(credentials);
    this.api = api;
    this.accountKey = accountKeyFor(credentials.serverUrl, credentials.username);
    this.accountStatus = result.accountStatus;
    this.screen = { name: 'home', tab: 'live' };
    this.notify();
    await this.loadLive();
  }

  logout(): void {
    dismissTvKeyboard();
    this.vodGenreIndexGeneration += 1;
    clearCredentials();
    this.api = null;
    this.accountKey = null;
    this.accountStatus = null;
    this.screen = { name: 'login' };
    this.resetBrowseState();
    this.notify();
  }

  setTab(tab: TabId): void {
    if (this.screen.name !== 'home') return;
    this.screen = { name: 'home', tab };
    this.notify();
    if (tab === 'live' && this.liveCategories.length === 0) {
      void this.loadLive();
    } else if (tab === 'movies' && this.vodHubRows.length === 0 && !this.vodLoading) {
      void this.loadMovies();
    } else if (tab === 'series' && this.seriesHubRows.length === 0 && !this.seriesLoading) {
      void this.loadSeriesList();
    }
  }

  async loadLive(): Promise<void> {
    if (!this.api) return;
    this.liveLoading = true;
    this.liveError = null;
    this.notify();
    try {
      const categories = await this.api.getLiveCategories();
      this.liveCategories = categories;
      this.liveSelectedCategory = categories[0] ?? null;
      if (this.liveSelectedCategory) {
        this.liveItems = await this.api.getLiveStreams(
          this.liveSelectedCategory.categoryId,
        );
      } else {
        this.liveItems = [];
      }
    } catch (e) {
      this.liveError = String(e);
    } finally {
      this.liveLoading = false;
      this.notify();
    }
  }

  async selectLiveCategory(category: Category): Promise<void> {
    if (!this.api) return;
    this.liveSelectedCategory = category;
    this.liveLoading = true;
    this.notify();
    try {
      this.liveItems = await this.api.getLiveStreams(category.categoryId);
    } catch (e) {
      this.liveError = String(e);
    } finally {
      this.liveLoading = false;
      this.notify();
    }
  }

  async setLiveSearch(query: string): Promise<void> {
    this.liveSearchQuery = query;
    if (!this.api) return;
    if (query.trim() && this.liveAllItems.length === 0) {
      this.liveLoading = true;
      this.notify();
      try {
        this.liveAllItems = await this.api.getLiveStreams();
      } catch (e) {
        this.liveError = String(e);
      } finally {
        this.liveLoading = false;
      }
    }
    this.notify();
  }

  filteredLiveItems(): LiveStreamItem[] {
    const source =
      this.liveSearchQuery.trim() && this.liveAllItems.length > 0
        ? this.liveAllItems
        : this.liveItems;
    return filterByTitle(source, this.liveSearchQuery, (i) => i.name);
  }

  async loadMovies(): Promise<void> {
    if (!this.api || this.vodLoading) return;
    this.vodGenreIndexGeneration += 1;
    const generation = this.vodGenreIndexGeneration;
    this.vodLoading = true;
    this.vodError = null;
    this.vodHubRows = [];
    this.vodAllMovies = [];
    this.notify();
    try {
      this.vodAllMovies = await this.api.getVodStreams();
      if (this.accountKey) {
        this.vodGenreByStreamId = loadVodGenreCache(this.accountKey);
      } else {
        this.vodGenreByStreamId = {};
      }
      this.rebuildVodHubRows();
      this.vodLoading = false;
      this.notify();

      if (this.accountKey && this.api) {
        void this.indexVodGenresInBackground(generation);
      }
    } catch (e) {
      this.vodError = String(e);
      this.vodLoading = false;
      this.notify();
    }
  }

  private rebuildVodHubRows(): void {
    this.vodHubRows = groupByGenre({
      items: this.vodAllMovies,
      genreFor: (m) => this.genreForMovie(m),
    });
  }

  private genreForMovie(movie: VodItem): string | null {
    return this.vodGenreByStreamId[movie.streamId] ?? movie.genre;
  }

  private async indexVodGenresInBackground(generation: number): Promise<void> {
    if (!this.api || !this.accountKey) return;
    const missingCount = this.vodAllMovies.filter((m) => !this.genreForMovie(m)).length;
    if (missingCount === 0) return;

    this.vodLoadingGenres = true;
    this.notify();

    const api = this.api;
    const accountKey = this.accountKey;
    const movies = this.vodAllMovies;

    await indexMissingVodGenres({
      api,
      accountKey,
      movies,
      cached: this.vodGenreByStreamId,
      isCancelled: () => generation !== this.vodGenreIndexGeneration,
      onProgress: (genres) => {
        if (generation !== this.vodGenreIndexGeneration) return;
        this.vodGenreByStreamId = genres;
        this.rebuildVodHubRows();
        this.notify();
      },
    });

    if (generation !== this.vodGenreIndexGeneration) return;
    this.vodLoadingGenres = false;
    this.rebuildVodHubRows();
    this.notify();
  }

  setVodSearch(query: string): void {
    this.vodSearchQuery = query;
    this.notify();
  }

  filteredVodItems(): VodItem[] {
    const needle = this.vodSearchQuery.trim().toLowerCase();
    if (!needle) return [];
    return this.vodAllMovies.filter((item) => {
      const genre = this.genreForMovie(item);
      const hay = [item.name, genre].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }

  vodHubRow(rowId: string): HubContentRow<VodItem> | null {
    return this.vodHubRows.find((r) => r.id === rowId) ?? null;
  }

  async loadSeriesList(): Promise<void> {
    if (!this.api || this.seriesLoading) return;
    this.seriesLoading = true;
    this.seriesError = null;
    this.seriesHubRows = [];
    this.seriesAllItems = [];
    this.notify();
    try {
      this.seriesAllItems = await this.api.getSeries();
      this.seriesHubRows = groupByGenre({
        items: this.seriesAllItems,
        genreFor: (s) => s.genre,
      });
    } catch (e) {
      this.seriesError = String(e);
    } finally {
      this.seriesLoading = false;
      this.notify();
    }
  }

  setSeriesSearch(query: string): void {
    this.seriesSearchQuery = query;
    this.notify();
  }

  filteredSeriesItems(): SeriesItem[] {
    const needle = this.seriesSearchQuery.trim().toLowerCase();
    if (!needle) return [];
    return this.seriesAllItems.filter((item) => {
      const hay = [item.name, item.genre, item.plot, item.year]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  seriesHubRow(rowId: string): HubContentRow<SeriesItem> | null {
    return this.seriesHubRows.find((r) => r.id === rowId) ?? null;
  }

  openHubBrowse(tab: 'movies' | 'series', rowId: string): void {
    this.screen = { name: 'hub-browse', tab, rowId };
    this.notify();
  }

  openSeriesDetail(series: SeriesItem): void {
    this.screen = { name: 'series-detail', series };
    this.seriesDetail = null;
    this.seriesDetailError = null;
    this.notify();
    void this.loadSeriesDetail(series);
  }

  async loadSeriesDetail(series: SeriesItem): Promise<void> {
    if (!this.api) return;
    this.seriesDetailLoading = true;
    this.notify();
    try {
      this.seriesDetail = await this.api.getSeriesInfo(series.seriesId);
    } catch (e) {
      this.seriesDetailError = String(e);
    } finally {
      this.seriesDetailLoading = false;
      this.notify();
    }
  }

  goHome(tab: TabId = 'live'): void {
    this.screen = { name: 'home', tab };
    this.notify();
  }

  openPlayer(request: import('../storage/watch-history').PlaybackRequest): void {
    this.screen = { name: 'player', request };
    this.notify();
  }

  handleBack(): boolean {
    if (this.screen.name === 'player') {
      this.goHome('live');
      return true;
    }
    if (this.screen.name === 'hub-browse') {
      this.goHome(this.screen.tab);
      return true;
    }
    if (this.screen.name === 'series-detail') {
      this.goHome('series');
      return true;
    }
    if (this.screen.name === 'home') {
      return false;
    }
    return false;
  }

  private resetBrowseState(): void {
    this.liveCategories = [];
    this.liveItems = [];
    this.liveAllItems = [];
    this.vodHubRows = [];
    this.vodAllMovies = [];
    this.vodGenreByStreamId = {};
    this.vodLoadingGenres = false;
    this.seriesHubRows = [];
    this.seriesAllItems = [];
    this.seriesDetail = null;
  }
}

export const appState = new AppState();
