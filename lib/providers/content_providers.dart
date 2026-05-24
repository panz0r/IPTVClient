import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../data/repositories/xtream_repository.dart';
import '../data/services/content_search.dart';
import 'auth_provider.dart';

class CategoryContentState<T> {
  const CategoryContentState({
    this.categories = const [],
    this.selectedCategory,
    this.items = const [],
    this.allItems = const [],
    this.searchQuery = '',
    this.isLoadingCategories = false,
    this.isLoadingItems = false,
    this.isLoadingAllItems = false,
    this.errorMessage,
  });

  final List<Category> categories;
  final Category? selectedCategory;
  final List<T> items;
  final List<T> allItems;
  final String searchQuery;
  final bool isLoadingCategories;
  final bool isLoadingItems;
  final bool isLoadingAllItems;
  final String? errorMessage;

  bool get isSearching => searchQuery.trim().isNotEmpty;

  List<T> filteredItems(String? Function(T item) titleFor) {
    if (!isSearching) {
      return items;
    }

    final source = allItems.isNotEmpty ? allItems : items;
    return filterContent(source, searchQuery, titleFor);
  }

  CategoryContentState<T> copyWith({
    List<Category>? categories,
    Category? selectedCategory,
    List<T>? items,
    List<T>? allItems,
    String? searchQuery,
    bool? isLoadingCategories,
    bool? isLoadingItems,
    bool? isLoadingAllItems,
    String? errorMessage,
    bool clearError = false,
    bool clearAllItems = false,
  }) {
    return CategoryContentState<T>(
      categories: categories ?? this.categories,
      selectedCategory: selectedCategory ?? this.selectedCategory,
      items: items ?? this.items,
      allItems: clearAllItems ? const [] : (allItems ?? this.allItems),
      searchQuery: searchQuery ?? this.searchQuery,
      isLoadingCategories: isLoadingCategories ?? this.isLoadingCategories,
      isLoadingItems: isLoadingItems ?? this.isLoadingItems,
      isLoadingAllItems: isLoadingAllItems ?? this.isLoadingAllItems,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class CategoryContentNotifier<T> extends Notifier<CategoryContentState<T>> {
  CategoryContentNotifier({
    required this.loadCategories,
    required this.loadItems,
    required this.titleFor,
  });

  final Future<List<Category>> Function(XtreamRepository repo) loadCategories;
  final Future<List<T>> Function(XtreamRepository repo, Category? category)
      loadItems;
  final String? Function(T item) titleFor;

  bool _loadScheduled = false;

  @override
  CategoryContentState<T> build() {
    ref.listen(xtreamRepositoryProvider, (previous, next) {
      if (next == null) {
        state = const CategoryContentState();
        _loadScheduled = false;
      } else if (previous != next) {
        _scheduleLoad();
      }
    });

    final repository = ref.read(xtreamRepositoryProvider);
    if (repository != null) {
      _scheduleLoad();
    }

    return CategoryContentState<T>(
      isLoadingCategories: repository != null,
    );
  }

  void _scheduleLoad() {
    if (_loadScheduled) {
      return;
    }
    _loadScheduled = true;
    Future.microtask(() async {
      _loadScheduled = false;
      await loadInitial();
    });
  }

  Future<void> loadInitial() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      state = const CategoryContentState();
      return;
    }

    if (state.isLoadingCategories && state.categories.isNotEmpty) {
      return;
    }

    state = state.copyWith(
      isLoadingCategories: true,
      clearError: true,
      clearAllItems: true,
      searchQuery: '',
    );

    try {
      final categories = await loadCategories(repository);
      Category? selected;
      if (categories.isNotEmpty) {
        selected = categories.first;
      }

      state = state.copyWith(
        categories: categories,
        selectedCategory: selected,
        isLoadingCategories: false,
        isLoadingItems: selected != null,
      );

      if (selected != null) {
        await selectCategory(selected);
      } else {
        state = state.copyWith(items: const []);
      }
    } catch (error) {
      state = state.copyWith(
        isLoadingCategories: false,
        errorMessage: 'Failed to load categories.',
      );
    }
  }

  Future<void> selectCategory(Category category) async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      return;
    }

    state = state.copyWith(
      selectedCategory: category,
      isLoadingItems: true,
      clearError: true,
      searchQuery: '',
    );

    try {
      final items = await loadItems(repository, category);
      state = state.copyWith(
        items: items,
        isLoadingItems: false,
      );
    } catch (error) {
      state = state.copyWith(
        items: const [],
        isLoadingItems: false,
        errorMessage: 'Failed to load items.',
      );
    }
  }

  Future<void> setSearchQuery(String query) async {
    if (query == state.searchQuery) {
      return;
    }

    state = state.copyWith(searchQuery: query, clearError: true);

    if (query.trim().isEmpty || state.allItems.isNotEmpty) {
      return;
    }

    await _loadAllItems();
  }

  Future<void> _loadAllItems() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      return;
    }

    state = state.copyWith(isLoadingAllItems: true);

    try {
      final allItems = await loadItems(repository, null);
      state = state.copyWith(
        allItems: allItems,
        isLoadingAllItems: false,
      );
    } catch (error) {
      state = state.copyWith(
        isLoadingAllItems: false,
        errorMessage: 'Failed to load items for search.',
      );
    }
  }

  Future<void> refresh() => loadInitial();
}

final liveContentProvider = NotifierProvider<
    CategoryContentNotifier<LiveStreamItem>,
    CategoryContentState<LiveStreamItem>>(() {
  return CategoryContentNotifier<LiveStreamItem>(
    loadCategories: (repo) => repo.getLiveCategories(),
    loadItems: (repo, category) => repo.getLiveStreams(category: category),
    titleFor: (item) => item.name,
  );
});

final moviesContentProvider = NotifierProvider<
    CategoryContentNotifier<VodItem>,
    CategoryContentState<VodItem>>(() {
  return CategoryContentNotifier<VodItem>(
    loadCategories: (repo) => repo.getVodCategories(),
    loadItems: (repo, category) => repo.getVodStreams(category: category),
    titleFor: (item) => item.name ?? item.title,
  );
});

final seriesContentProvider = NotifierProvider<
    CategoryContentNotifier<SeriesItem>,
    CategoryContentState<SeriesItem>>(() {
  return CategoryContentNotifier<SeriesItem>(
    loadCategories: (repo) => repo.getSeriesCategories(),
    loadItems: (repo, category) => repo.getSeries(category: category),
    titleFor: (item) => item.name ?? item.title,
  );
});

class SeriesDetailState {
  const SeriesDetailState({
    this.info,
    this.isLoading = false,
    this.errorMessage,
  });

  final SeriesInfo? info;
  final bool isLoading;
  final String? errorMessage;
}

class SeriesDetailNotifier extends Notifier<SeriesDetailState> {
  SeriesDetailNotifier(this.series);

  final SeriesItem series;

  @override
  SeriesDetailState build() {
    Future.microtask(load);
    return const SeriesDetailState(isLoading: true);
  }

  Future<void> load() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      return;
    }

    state = const SeriesDetailState(isLoading: true);

    try {
      final info = await repository.getSeriesInfo(series);
      state = SeriesDetailState(info: info);
    } catch (error) {
      state = const SeriesDetailState(
        errorMessage: 'Failed to load series details.',
      );
    }
  }
}

final seriesDetailProvider = NotifierProvider.family<
    SeriesDetailNotifier,
    SeriesDetailState,
    SeriesItem>(SeriesDetailNotifier.new);

void invalidateContentProviders(Ref ref) {
  ref.invalidate(liveContentProvider);
  ref.invalidate(moviesContentProvider);
  ref.invalidate(seriesContentProvider);
}
