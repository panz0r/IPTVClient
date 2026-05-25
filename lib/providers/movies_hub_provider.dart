import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../data/models/watch_history_entry.dart';
import '../data/repositories/xtream_repository.dart';
import '../data/services/content_search.dart';
import '../data/services/genre_grouper.dart';
import '../data/services/vod_genre_cache.dart';
import '../data/services/vod_genre_indexer.dart';
import 'credentials_provider.dart';
import 'xtream_repository_provider.dart';

class MoviesHubState {
  const MoviesHubState({
    this.categories = const [],
    this.allMovies = const [],
    this.genreRows = const [],
    this.providerRows = const [],
    this.recentRow,
    this.searchQuery = '',
    this.searchResults = const [],
    this.genreByStreamId = const {},
    this.isLoading = false,
    this.isLoadingGenres = false,
    this.genreLoadProgress = 0,
    this.genreLoadTotal = 0,
    this.errorMessage,
  });

  final List<Category> categories;
  final List<VodItem> allMovies;
  final List<HubContentRow<VodItem>> genreRows;
  final List<HubContentRow<VodItem>> providerRows;
  final HubContentRow<VodItem>? recentRow;
  final String searchQuery;
  final List<VodItem> searchResults;
  final Map<int, String> genreByStreamId;
  final bool isLoading;
  final bool isLoadingGenres;
  final int genreLoadProgress;
  final int genreLoadTotal;
  final String? errorMessage;

  bool get isSearching => searchQuery.trim().isNotEmpty;

  bool get hasGenreRows => genreRows.isNotEmpty;

  MoviesHubState copyWith({
    List<Category>? categories,
    List<VodItem>? allMovies,
    List<HubContentRow<VodItem>>? genreRows,
    List<HubContentRow<VodItem>>? providerRows,
    HubContentRow<VodItem>? recentRow,
    bool clearRecentRow = false,
    String? searchQuery,
    List<VodItem>? searchResults,
    Map<int, String>? genreByStreamId,
    bool? isLoading,
    bool? isLoadingGenres,
    int? genreLoadProgress,
    int? genreLoadTotal,
    String? errorMessage,
    bool clearError = false,
  }) {
    return MoviesHubState(
      categories: categories ?? this.categories,
      allMovies: allMovies ?? this.allMovies,
      genreRows: genreRows ?? this.genreRows,
      providerRows: providerRows ?? this.providerRows,
      recentRow: clearRecentRow ? null : (recentRow ?? this.recentRow),
      searchQuery: searchQuery ?? this.searchQuery,
      searchResults: searchResults ?? this.searchResults,
      genreByStreamId: genreByStreamId ?? this.genreByStreamId,
      isLoading: isLoading ?? this.isLoading,
      isLoadingGenres: isLoadingGenres ?? this.isLoadingGenres,
      genreLoadProgress: genreLoadProgress ?? this.genreLoadProgress,
      genreLoadTotal: genreLoadTotal ?? this.genreLoadTotal,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

final vodGenreCacheProvider = Provider<VodGenreCache>((ref) => VodGenreCache());

final moviesHubProvider =
    NotifierProvider<MoviesHubNotifier, MoviesHubState>(MoviesHubNotifier.new);

class MoviesHubNotifier extends Notifier<MoviesHubState> {
  VodGenreIndexer? _indexer;

  @override
  MoviesHubState build() {
    ref.listen(xtreamRepositoryProvider, (previous, next) {
      if (next == null) {
        _indexer?.cancel();
        state = const MoviesHubState();
      } else if (previous != next) {
        _load();
      }
    });

    final repository = ref.read(xtreamRepositoryProvider);
    if (repository != null) {
      Future.microtask(_load);
    }

    return MoviesHubState(isLoading: repository != null);
  }

  Future<String?> _accountKey() async {
    final credentials = await ref.read(credentialsStoreProvider).load();
    if (credentials == null) {
      return null;
    }
    return WatchHistoryEntry.accountKeyFor(
      credentials.serverUrl,
      credentials.username,
    );
  }

  Future<void> _load() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      state = const MoviesHubState();
      return;
    }

    _indexer?.cancel();
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final categories = await repository.getVodCategories();
      final movies = await repository.getVodStreams(category: null);

      final accountKey = await _accountKey();
      var genreByStreamId = <int, String>{};
      if (accountKey != null) {
        genreByStreamId = await ref.read(vodGenreCacheProvider).load(accountKey);
      }

      final genreRows = _buildGenreRows(movies, genreByStreamId);
      final providerRows = _buildProviderRows(movies, categories);
      final recent = recentlyAddedRow<VodItem>(
        items: movies,
        dateFor: (m) => m.added,
      );

      state = MoviesHubState(
        categories: categories,
        allMovies: movies,
        genreRows: genreRows,
        providerRows: providerRows,
        recentRow: recent.isNotEmpty ? recent.first : null,
        genreByStreamId: genreByStreamId,
        isLoading: false,
        isLoadingGenres: accountKey != null && genreRows.isEmpty,
      );

      _applySearch();

      if (accountKey != null) {
        _indexGenresInBackground(repository, movies, accountKey);
      }
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        isLoadingGenres: false,
        errorMessage: 'Failed to load movies.',
      );
    }
  }

  List<HubContentRow<VodItem>> _buildGenreRows(
    List<VodItem> movies,
    Map<int, String> genreByStreamId,
  ) {
    return groupByGenre<VodItem>(
      items: movies,
      genreFor: (m) {
        final id = m.streamId;
        if (id == null) {
          return null;
        }
        return genreByStreamId[id];
      },
    );
  }

  List<HubContentRow<VodItem>> _buildProviderRows(
    List<VodItem> movies,
    List<Category> categories,
  ) {
    final rows = <HubContentRow<VodItem>>[];

    rows.addAll(
      groupByProviderCategories<VodItem>(
        items: movies,
        categories: categories,
        categoryIdsFor: vodCategoryIds,
      ),
    );

    rows.addAll(
      uncategorizedRow<VodItem>(
        items: movies,
        categoryIdsFor: vodCategoryIds,
        title: 'Other movies',
      ),
    );

    return rows;
  }

  Future<void> _indexGenresInBackground(
    XtreamRepository repository,
    List<VodItem> movies,
    String accountKey,
  ) async {
    final missingCount = movies
        .where((m) => m.streamId != null && !state.genreByStreamId.containsKey(m.streamId))
        .length;

    if (missingCount == 0) {
      state = state.copyWith(isLoadingGenres: false);
      return;
    }

    _indexer = VodGenreIndexer(
      repository: repository,
      cache: ref.read(vodGenreCacheProvider),
      accountKey: accountKey,
    );

    state = state.copyWith(
      isLoadingGenres: true,
      genreLoadProgress: 0,
      genreLoadTotal: missingCount,
    );

    var lastUiUpdate = 0;
    final genres = await _indexer!.indexMissing(
      movies: movies,
      onProgress: (completed, total, genresSoFar) {
        if (!ref.mounted) {
          return;
        }
        // Update UI occasionally so genre rows appear without freezing.
        if (completed - lastUiUpdate < 100 && completed != total) {
          return;
        }
        lastUiUpdate = completed;

        state = state.copyWith(
          genreByStreamId: genresSoFar,
          genreRows: _buildGenreRows(state.allMovies, genresSoFar),
          genreLoadProgress: completed,
          genreLoadTotal: total,
          isLoadingGenres: completed < total,
        );
        _applySearch();
      },
    );

    if (!ref.mounted) {
      return;
    }

    state = state.copyWith(
      genreByStreamId: genres,
      genreRows: _buildGenreRows(state.allMovies, genres),
      isLoadingGenres: false,
      genreLoadProgress: 0,
      genreLoadTotal: 0,
    );
    _applySearch();
  }

  String? _genreForMovie(VodItem movie) {
    final id = movie.streamId;
    if (id == null) {
      return null;
    }
    return state.genreByStreamId[id];
  }

  void setSearchQuery(String query) {
    if (query == state.searchQuery) {
      return;
    }
    state = state.copyWith(searchQuery: query, clearError: true);
    _applySearch();
  }

  void _applySearch() {
    final query = state.searchQuery;
    if (query.trim().isEmpty) {
      state = state.copyWith(searchResults: const []);
      return;
    }

    final results = filterContentMultiField<VodItem>(
      state.allMovies,
      query,
      titleFor: (m) => m.name ?? m.title,
      genreFor: _genreForMovie,
    );

    state = state.copyWith(searchResults: results);
  }

  Future<void> refresh() => _load();
}
