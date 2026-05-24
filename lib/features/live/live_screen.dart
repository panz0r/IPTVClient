import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/category_browse_layout.dart';
import '../../data/models/playback_request.dart';
import '../../providers/auth_provider.dart';
import '../../providers/content_providers.dart';

class LiveScreen extends ConsumerWidget {
  const LiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(liveContentProvider);
    final repository = ref.watch(xtreamRepositoryProvider);

    return CategoryBrowseLayout(
      categories: state.categories,
      selectedCategory: state.selectedCategory,
      items: state.filteredItems((item) => item.name),
      isLoadingCategories: state.isLoadingCategories,
      isLoadingItems: state.isLoadingItems,
      isLoadingSearch: state.isLoadingAllItems,
      isSearching: state.isSearching,
      searchQuery: state.searchQuery,
      searchHint: 'Search channels...',
      onSearchChanged: ref.read(liveContentProvider.notifier).setSearchQuery,
      errorMessage: state.errorMessage,
      onCategorySelected: (category) =>
          ref.read(liveContentProvider.notifier).selectCategory(category),
      onRetry: () => ref.read(liveContentProvider.notifier).refresh(),
      emptyMessage: 'No live categories found.',
      itemBuilder: (context, item) {
        return ContentTile(
          title: item.name ?? 'Unknown channel',
          imageUrl: item.streamIcon ?? item.thumbnail,
          icon: Icons.live_tv_outlined,
          onTap: () {
            if (repository == null) {
              return;
            }

            try {
              final url = repository.buildLiveStreamUrl(item);
              context.push(
                '/player',
                extra: PlaybackRequest(
                  title: item.name ?? 'Live channel',
                  url: url,
                ),
              );
            } catch (error) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Unable to play this channel.')),
              );
            }
          },
        );
      },
    );
  }
}
