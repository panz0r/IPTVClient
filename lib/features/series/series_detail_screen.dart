import 'package:cached_network_image/cached_network_image.dart';
import 'package:dpad/dpad.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart' hide Icon;

import '../../core/widgets/common_widgets.dart';
import '../../data/models/watch_history_entry.dart';
import '../../data/services/playback_helpers.dart';
import '../../providers/content_providers.dart';
import '../../providers/watch_history_provider.dart';
import '../../data/repositories/xtream_repository.dart';
import '../../providers/xtream_repository_provider.dart';

class SeriesDetailScreen extends ConsumerWidget {
  const SeriesDetailScreen({super.key, required this.series});

  final SeriesItem series;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(seriesDetailProvider(series));
    final repository = ref.watch(xtreamRepositoryProvider);
    final title = series.name ?? series.title ?? 'Series';

    if (state.isLoading) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const LoadingState(message: 'Loading episodes...'),
      );
    }

    if (state.errorMessage != null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: ErrorState(
          message: state.errorMessage!,
          onRetry: () =>
              ref.read(seriesDetailProvider(series).notifier).load(),
        ),
      );
    }

    final info = state.info;
    if (info == null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const EmptyState(message: 'No series information available.'),
      );
    }

    final episodesBySeason = info.episodes ?? {};
    if (episodesBySeason.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const EmptyState(message: 'No episodes found for this series.'),
      );
    }

    final details = info.info;
    final backdrop = details.backdropPath?.isNotEmpty == true
        ? details.backdropPath!.first
        : series.cover;
    final plot = details.plot ?? series.plot;
    final genre = details.genre ?? series.genre;
    final cast = details.cast ?? series.cast;
    final rating = details.rating ?? series.rating;

    final seasonKeys = episodesBySeason.keys.toList()
      ..sort(
        (a, b) => int.tryParse(a)?.compareTo(int.tryParse(b) ?? 0) ?? a.compareTo(b),
      );

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              title: Text(title),
              background: backdrop != null && backdrop.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: backdrop,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => const ColoredBox(
                        color: Colors.black26,
                      ),
                    )
                  : null,
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (series.year != null)
                    Text(
                      series.year!,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  if (rating != null) ...[
                    const SizedBox(height: 8),
                    Text('Rating: $rating'),
                  ],
                  if (genre != null && genre.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Genre: $genre'),
                  ],
                  if (cast != null && cast.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Cast: $cast'),
                  ],
                  if (plot != null && plot.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(plot, style: Theme.of(context).textTheme.bodyLarge),
                  ],
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
          for (final seasonKey in seasonKeys) ...[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Text(
                  'Season $seasonKey',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final episode = episodesBySeason[seasonKey]![index];
                  return _EpisodeTile(
                    episode: episode,
                    series: series,
                    seriesTitle: title,
                    repository: repository,
                  );
                },
                childCount: episodesBySeason[seasonKey]!.length,
              ),
            ),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }
}

class _EpisodeTile extends ConsumerWidget {
  const _EpisodeTile({
    required this.episode,
    required this.series,
    required this.seriesTitle,
    required this.repository,
  });

  final Episode episode;
  final SeriesItem series;
  final String seriesTitle;
  final XtreamRepository? repository;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final episodeTitle =
        episode.title ?? 'Episode ${episode.episodeNum ?? episode.id ?? ''}';
    final playbackTitle = '$seriesTitle · $episodeTitle';

    return DpadFocusable(
      onSelect: () => _playEpisode(context, ref, playbackTitle),
      builder: (context, isFocused, child) {
        return Card(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: isFocused
                ? BorderSide(
                    color: Theme.of(context).colorScheme.primary,
                    width: 2,
                  )
                : BorderSide.none,
          ),
          child: ListTile(
            leading: episode.info.movieImage != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: PosterImage(
                        imageUrl: episode.info.movieImage,
                        icon: Icons.play_circle_outline,
                      ),
                    ),
                  )
                : const Icon(Icons.play_circle_outline),
            title: Text(episodeTitle),
            subtitle: episode.info.plot != null
                ? Text(
                    episode.info.plot!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  )
                : null,
            onTap: () => _playEpisode(context, ref, playbackTitle),
          ),
        );
      },
    );
  }

  void _playEpisode(BuildContext context, WidgetRef ref, String title) {
    if (repository == null) {
      return;
    }

    final seriesId = series.seriesId;
    if (seriesId == null) {
      return;
    }

    try {
      final url = repository!.buildEpisodeUrl(episode);
      final history = ref.read(watchHistoryProvider).entries;
      final episodeId = episode.id;
      final contentKey = episodeId != null
          ? WatchHistoryEntry.seriesEpisodeContentKey(seriesId, episodeId)
          : null;
      final resumeMs = resumePositionForContent(
        history: history,
        contentKey: contentKey,
      );

      final request = playbackRequestForEpisode(
        episode: episode,
        url: url,
        seriesId: seriesId,
        seriesTitle: seriesTitle,
        imageUrl: episode.info.movieImage ?? series.cover,
        resumePositionMs: resumeMs ?? 0,
      );

      context.push('/player', extra: request);
    } catch (error) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to play this episode.')),
      );
    }
  }
}
