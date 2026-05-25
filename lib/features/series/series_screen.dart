import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../../data/models/playback_request.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/widgets/continue_watching_sliver.dart';
import '../../core/widgets/hub_row_sliver.dart';
import '../../core/widgets/hub_search_field.dart';
import '../../core/widgets/hub_section_header.dart';
import '../../core/widgets/poster_card.dart';
import '../../data/services/genre_grouper.dart';
import '../../providers/series_hub_provider.dart';
import '../browse/hub_browse_screen.dart';

class SeriesScreen extends ConsumerWidget {
  const SeriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(seriesHubProvider);
    final notifier = ref.read(seriesHubProvider.notifier);

    if (state.isLoading) {
      return const Scaffold(
        body: LoadingState(message: 'Loading catalog...'),
      );
    }

    if (state.errorMessage != null) {
      return Scaffold(
        body: ErrorState(
          message: state.errorMessage!,
          onRetry: notifier.refresh,
        ),
      );
    }

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: HubSearchField(
            hintText: 'Search series by title, cast, or genre…',
            searchQuery: state.searchQuery,
            onSearchChanged: notifier.setSearchQuery,
          ),
        ),
        if (state.isSearching)
          _SearchResultsSliver(series: state.searchResults)
        else ...[
          const ContinueWatchingSliver(kind: PlaybackKind.series),
          if (state.recentRow != null)
            HubRowSliver<SeriesItem>(
              title: state.recentRow!.title,
              items: state.recentRow!.items,
              itemBuilder: _seriesPoster,
              onSeeAll: () => _openSeeAll(context, state.recentRow!),
            ),
          for (final row in state.genreRows)
            HubRowSliver<SeriesItem>(
              title: row.title,
              items: row.items,
              itemBuilder: _seriesPoster,
              onSeeAll: () => _openSeeAll(context, row),
            ),
          if (state.hasGenreRows && state.providerRows.isNotEmpty)
            const SliverToBoxAdapter(
              child: HubSectionHeader(title: 'Provider categories'),
            ),
          if (!state.hasGenreRows)
            for (final row in state.providerRows)
              HubRowSliver<SeriesItem>(
                title: row.title,
                items: row.items,
                itemBuilder: _seriesPoster,
                onSeeAll: () => _openSeeAll(context, row),
              ),
          if (state.genreRows.isEmpty &&
              state.providerRows.isEmpty &&
              state.recentRow == null)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: EmptyState(message: 'No series found.'),
              ),
            ),
        ],
      ],
    );
  }

  static Widget _seriesPoster(BuildContext context, SeriesItem item) {
    return PosterCard(
      title: item.name ?? item.title ?? 'Series',
      subtitle: item.year,
      imageUrl: item.cover,
      icon: Icons.video_library_outlined,
      onTap: () => context.push('/series/${item.seriesId}', extra: item),
    );
  }

  static void _openSeeAll(BuildContext context, HubContentRow<SeriesItem> row) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => HubBrowseScreen<SeriesItem>(
          title: row.title,
          items: row.items,
          itemBuilder: (context, item) => _seriesPoster(context, item),
        ),
      ),
    );
  }
}

class _SearchResultsSliver extends StatelessWidget {
  const _SearchResultsSliver({required this.series});

  final List<SeriesItem> series;

  @override
  Widget build(BuildContext context) {
    if (series.isEmpty) {
      return const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: EmptyState(
            message: 'No series match your search.',
            icon: Icons.search_off_outlined,
          ),
        ),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.all(16),
      sliver: SliverGrid(
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 140,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.55,
        ),
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final item = series[index];
            return PosterCard(
              title: item.name ?? item.title ?? 'Series',
              subtitle: item.year,
              imageUrl: item.cover,
              icon: Icons.video_library_outlined,
              width: double.infinity,
              onTap: () => context.push('/series/${item.seriesId}', extra: item),
            );
          },
          childCount: series.length,
        ),
      ),
    );
  }
}
