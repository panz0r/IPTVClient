import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/playback_request.dart';
import '../../data/models/watch_history_entry.dart';
import '../../providers/watch_history_provider.dart';
import 'horizontal_poster_row.dart';
import 'poster_card.dart';

class ContinueWatchingSliver extends ConsumerWidget {
  const ContinueWatchingSliver({
    super.key,
    required this.kind,
  });

  final PlaybackKind kind;

  String get _clearDialogTitle => switch (kind) {
        PlaybackKind.vod => 'Clear recently watched movies?',
        PlaybackKind.series => 'Clear recently watched series?',
        _ => 'Clear recently watched?',
      };

  String get _clearDialogBody => switch (kind) {
        PlaybackKind.vod =>
          'Remove all movies from your recently watched list on this tab?',
        PlaybackKind.series =>
          'Remove all series from your recently watched list on this tab?',
        _ => 'Remove all titles from your recently watched list?',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyState = ref.watch(watchHistoryProvider);
    final entries = historyState.recentlyWatchedFor(kind);

    if (historyState.isLoading || entries.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final notifier = ref.read(watchHistoryProvider.notifier);

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Recently watched',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: Text(_clearDialogTitle),
                        content: Text(_clearDialogBody),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Clear all'),
                          ),
                        ],
                      ),
                    );
                    if (confirmed == true) {
                      await notifier.clearForKind(kind);
                    }
                  },
                  child: const Text('Clear all'),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: HorizontalPosterRow(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return _ContinueWatchingCard(
                entry: entry,
                onRemove: () => notifier.removeEntry(entry.contentKey),
              );
            },
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
      ],
    );
  }
}

class _ContinueWatchingCard extends StatelessWidget {
  const _ContinueWatchingCard({
    required this.entry,
    required this.onRemove,
  });

  final WatchHistoryEntry entry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        PosterCard(
          title: entry.title,
          subtitle: entry.subtitle ?? entry.seriesTitle,
          imageUrl: entry.imageUrl,
          icon: entry.kind == PlaybackKind.series
              ? Icons.video_library_outlined
              : Icons.movie_outlined,
          progress: entry.progressFraction,
          onTap: () => context.push('/player', extra: entry.toPlaybackRequest()),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: Material(
            color: Colors.black54,
            shape: const CircleBorder(),
            child: IconButton(
              tooltip: 'Remove from recently watched',
              icon: const Icon(Icons.close, size: 18, color: Colors.white),
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
              onPressed: onRemove,
            ),
          ),
        ),
      ],
    );
  }
}
