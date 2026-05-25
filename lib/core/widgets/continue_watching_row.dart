import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/playback_request.dart';
import '../../providers/watch_history_provider.dart';
import 'content_row.dart' as hub;
import 'horizontal_poster_row.dart';
import 'poster_card.dart';

class ContinueWatchingRow extends ConsumerWidget {
  const ContinueWatchingRow({super.key, required this.kind});

  final PlaybackKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(watchHistoryProvider).recentlyWatchedFor(kind);
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }

    return hub.ContentRow(
      title: 'Continue watching',
      child: HorizontalPosterRow(
        itemCount: entries.length,
        itemBuilder: (context, index) {
          final entry = entries[index];
          return PosterCard(
            title: entry.title,
            subtitle: entry.subtitle ?? entry.seriesTitle,
            imageUrl: entry.imageUrl,
            icon: entry.kind == PlaybackKind.series
                ? Icons.video_library_outlined
                : Icons.movie_outlined,
            progress: entry.progressFraction,
            onTap: () => context.push('/player', extra: entry.toPlaybackRequest()),
          );
        },
      ),
    );
  }
}
