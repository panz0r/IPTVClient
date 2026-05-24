import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../../core/widgets/category_browse_layout.dart';
import '../../providers/content_providers.dart';

class SeriesScreen extends ConsumerWidget {
  const SeriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(seriesContentProvider);

    return CategoryBrowseLayout<SeriesItem>(
      categories: state.categories,
      selectedCategory: state.selectedCategory,
      items: state.filteredItems((item) => item.name ?? item.title),
      isLoadingCategories: state.isLoadingCategories,
      isLoadingItems: state.isLoadingItems,
      isLoadingSearch: state.isLoadingAllItems,
      isSearching: state.isSearching,
      searchQuery: state.searchQuery,
      searchHint: 'Search series...',
      onSearchChanged: ref.read(seriesContentProvider.notifier).setSearchQuery,
      errorMessage: state.errorMessage,
      onCategorySelected: (category) =>
          ref.read(seriesContentProvider.notifier).selectCategory(category),
      onRetry: () => ref.read(seriesContentProvider.notifier).refresh(),
      emptyMessage: 'No series categories found.',
      itemBuilder: (context, item) {
        return ContentTile(
          title: item.name ?? item.title ?? 'Unknown series',
          subtitle: item.year,
          imageUrl: item.cover,
          icon: Icons.video_library_outlined,
          onTap: () => context.push('/series/${item.seriesId}', extra: item),
        );
      },
    );
  }
}
