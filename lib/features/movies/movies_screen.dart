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
import '../../providers/movies_hub_provider.dart';
import '../browse/hub_browse_screen.dart';

class MoviesScreen extends ConsumerWidget {
  const MoviesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(moviesHubProvider);
    final notifier = ref.read(moviesHubProvider.notifier);

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
            hintText: 'Search movies by title or genre…',
            searchQuery: state.searchQuery,
            onSearchChanged: notifier.setSearchQuery,
          ),
        ),
        if (state.isSearching)
          _SearchResultsSliver(movies: state.searchResults)
        else ...[
          const ContinueWatchingSliver(kind: PlaybackKind.vod),
          if (state.recentRow != null)
            HubRowSliver<VodItem>(
              title: state.recentRow!.title,
              items: state.recentRow!.items,
              itemBuilder: _moviePoster,
              onSeeAll: () => _openSeeAll(context, state.recentRow!),
            ),
          if (state.isLoadingGenres && !state.hasGenreRows)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text('Loading genres from your library…'),
              ),
            ),
          for (final row in state.genreRows)
            HubRowSliver<VodItem>(
              title: row.title,
              items: row.items,
              itemBuilder: _moviePoster,
              onSeeAll: () => _openSeeAll(context, row),
            ),
          if (state.hasGenreRows && state.providerRows.isNotEmpty)
            const SliverToBoxAdapter(
              child: HubSectionHeader(title: 'Provider categories'),
            ),
          if (!state.hasGenreRows)
            for (final row in state.providerRows)
              HubRowSliver<VodItem>(
                title: row.title,
                items: row.items,
                itemBuilder: _moviePoster,
                onSeeAll: () => _openSeeAll(context, row),
              ),
          if (state.genreRows.isEmpty &&
              state.providerRows.isEmpty &&
              state.recentRow == null)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: EmptyState(message: 'No movies found.'),
              ),
            ),
        ],
      ],
    );
  }

  static Widget _moviePoster(BuildContext context, VodItem item) {
    return PosterCard(
      title: item.name ?? item.title ?? 'Movie',
      subtitle: item.year,
      imageUrl: item.streamIcon,
      icon: Icons.movie_outlined,
      onTap: () => context.push('/movie/${item.streamId}', extra: item),
    );
  }

  static void _openSeeAll(BuildContext context, HubContentRow<VodItem> row) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => HubBrowseScreen<VodItem>(
          title: row.title,
          items: row.items,
          itemBuilder: (context, item) => _moviePoster(context, item),
        ),
      ),
    );
  }
}

class _SearchResultsSliver extends StatelessWidget {
  const _SearchResultsSliver({required this.movies});

  final List<VodItem> movies;

  @override
  Widget build(BuildContext context) {
    if (movies.isEmpty) {
      return const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: EmptyState(
            message: 'No movies match your search.',
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
            final item = movies[index];
            return PosterCard(
              title: item.name ?? item.title ?? 'Movie',
              subtitle: item.year,
              imageUrl: item.streamIcon,
              icon: Icons.movie_outlined,
              width: double.infinity,
              onTap: () => context.push('/movie/${item.streamId}', extra: item),
            );
          },
          childCount: movies.length,
        ),
      ),
    );
  }
}
