import 'package:dpad/dpad.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart' hide Icon;

import '../../core/widgets/common_widgets.dart';
import '../../data/models/playback_request.dart';
import '../../data/repositories/xtream_repository.dart';
import '../../providers/auth_provider.dart';
import '../../providers/content_providers.dart';

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

    final seasonKeys = episodesBySeason.keys.toList()
      ..sort(
        (a, b) => int.tryParse(a)?.compareTo(int.tryParse(b) ?? 0) ?? a.compareTo(b),
      );

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (info.info.plot != null && info.info.plot!.isNotEmpty) ...[
            Text(
              info.info.plot!,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
          ],
          for (final seasonKey in seasonKeys) ...[
            Text(
              'Season $seasonKey',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            ...?episodesBySeason[seasonKey]?.map(
              (episode) => _EpisodeTile(
                episode: episode,
                fallbackTitle: title,
                repository: repository,
              ),
            ),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }
}

class _EpisodeTile extends StatelessWidget {
  const _EpisodeTile({
    required this.episode,
    required this.fallbackTitle,
    required this.repository,
  });

  final Episode episode;
  final String fallbackTitle;
  final XtreamRepository? repository;

  @override
  Widget build(BuildContext context) {
    final episodeTitle =
        episode.title ?? 'Episode ${episode.episodeNum ?? episode.id ?? ''}';
    final playbackTitle = '$fallbackTitle · $episodeTitle';

    return DpadFocusable(
      onSelect: () => _playEpisode(context, playbackTitle),
      builder: (context, isFocused, child) {
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
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
            onTap: () => _playEpisode(context, playbackTitle),
          ),
        );
      },
    );
  }

  void _playEpisode(BuildContext context, String title) {
    if (repository == null) {
      return;
    }

    try {
      final url = repository!.buildEpisodeUrl(episode);
      context.push(
        '/player',
        extra: PlaybackRequest(title: title, url: url),
      );
    } catch (error) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to play this episode.')),
      );
    }
  }
}
