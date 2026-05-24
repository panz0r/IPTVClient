import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/category_browse_layout.dart';
import '../../data/models/playback_request.dart';
import '../../providers/auth_provider.dart';
import '../../providers/content_providers.dart';

class MoviesScreen extends ConsumerWidget {
  const MoviesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(moviesContentProvider);
    final repository = ref.watch(xtreamRepositoryProvider);

    return CategoryBrowseLayout(
      categories: state.categories,
      selectedCategory: state.selectedCategory,
      items: state.filteredItems((item) => item.name ?? item.title),
      isLoadingCategories: state.isLoadingCategories,
      isLoadingItems: state.isLoadingItems,
      isLoadingSearch: state.isLoadingAllItems,
      isSearching: state.isSearching,
      searchQuery: state.searchQuery,
      searchHint: 'Search movies...',
      onSearchChanged: ref.read(moviesContentProvider.notifier).setSearchQuery,
      errorMessage: state.errorMessage,
      onCategorySelected: (category) =>
          ref.read(moviesContentProvider.notifier).selectCategory(category),
      onRetry: () => ref.read(moviesContentProvider.notifier).refresh(),
      emptyMessage: 'No movie categories found.',
      itemBuilder: (context, item) {
        return ContentTile(
          title: item.name ?? item.title ?? 'Unknown movie',
          subtitle: item.year,
          imageUrl: item.streamIcon,
          icon: Icons.movie_outlined,
          onTap: () {
            if (repository == null) {
              return;
            }

            try {
              final url = repository.buildVodUrl(item);
              context.push(
                '/player',
                extra: PlaybackRequest(
                  title: item.name ?? item.title ?? 'Movie',
                  url: url,
                ),
              );
            } catch (error) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Unable to play this movie.')),
              );
            }
          },
        );
      },
    );
  }
}
