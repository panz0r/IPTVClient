import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../data/services/content_search.dart';
import '../data/services/genre_grouper.dart';
import 'xtream_repository_provider.dart';

class SeriesHubState {
  const SeriesHubState({
    this.categories = const [],
    this.allSeries = const [],
    this.genreRows = const [],
    this.providerRows = const [],
    this.recentRow,
    this.searchQuery = '',
    this.searchResults = const [],
    this.isLoading = false,
    this.errorMessage,
  });

  final List<Category> categories;
  final List<SeriesItem> allSeries;
  final List<HubContentRow<SeriesItem>> genreRows;
  final List<HubContentRow<SeriesItem>> providerRows;
  final HubContentRow<SeriesItem>? recentRow;
  final String searchQuery;
  final List<SeriesItem> searchResults;
  final bool isLoading;
  final String? errorMessage;

  bool get isSearching => searchQuery.trim().isNotEmpty;

  bool get hasGenreRows => genreRows.isNotEmpty;

  SeriesHubState copyWith({
    List<Category>? categories,
    List<SeriesItem>? allSeries,
    List<HubContentRow<SeriesItem>>? genreRows,
    List<HubContentRow<SeriesItem>>? providerRows,
    HubContentRow<SeriesItem>? recentRow,
    bool clearRecentRow = false,
    String? searchQuery,
    List<SeriesItem>? searchResults,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return SeriesHubState(
      categories: categories ?? this.categories,
      allSeries: allSeries ?? this.allSeries,
      genreRows: genreRows ?? this.genreRows,
      providerRows: providerRows ?? this.providerRows,
      recentRow: clearRecentRow ? null : (recentRow ?? this.recentRow),
      searchQuery: searchQuery ?? this.searchQuery,
      searchResults: searchResults ?? this.searchResults,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

final seriesHubProvider =
    NotifierProvider<SeriesHubNotifier, SeriesHubState>(SeriesHubNotifier.new);

class SeriesHubNotifier extends Notifier<SeriesHubState> {
  @override
  SeriesHubState build() {
    ref.listen(xtreamRepositoryProvider, (previous, next) {
      if (next == null) {
        state = const SeriesHubState();
      } else if (previous != next) {
        _load();
      }
    });

    final repository = ref.read(xtreamRepositoryProvider);
    if (repository != null) {
      Future.microtask(_load);
    }

    return SeriesHubState(isLoading: repository != null);
  }

  Future<void> _load() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      state = const SeriesHubState();
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final categories = await repository.getSeriesCategories();
      final series = await repository.getSeries(category: null);

      final genreRows = groupByGenre<SeriesItem>(
        items: series,
        genreFor: (s) => s.genre,
      );
      final providerRows = _buildProviderRows(series, categories);
      final recent = recentlyAddedRow<SeriesItem>(
        items: series,
        dateFor: (s) => s.lastModified ?? s.releaseDate,
      );

      state = SeriesHubState(
        categories: categories,
        allSeries: series,
        genreRows: genreRows,
        providerRows: providerRows,
        recentRow: recent.isNotEmpty ? recent.first : null,
        isLoading: false,
      );
      _applySearch();
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to load series.',
      );
    }
  }

  List<HubContentRow<SeriesItem>> _buildProviderRows(
    List<SeriesItem> series,
    List<Category> categories,
  ) {
    final rows = <HubContentRow<SeriesItem>>[];

    rows.addAll(
      groupByProviderCategories<SeriesItem>(
        items: series,
        categories: categories,
        categoryIdsFor: seriesCategoryIds,
      ),
    );

    rows.addAll(
      uncategorizedRow<SeriesItem>(
        items: series,
        categoryIdsFor: seriesCategoryIds,
        title: 'Other series',
      ),
    );

    return rows;
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

    final results = filterContentMultiField<SeriesItem>(
      state.allSeries,
      query,
      titleFor: (s) => s.name ?? s.title,
      genreFor: (s) => s.genre,
      castFor: (s) => s.cast,
    );

    state = state.copyWith(searchResults: results);
  }

  Future<void> refresh() => _load();
}
