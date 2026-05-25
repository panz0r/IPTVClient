import 'package:xtream_code_client/xtream_code_client.dart';

import '../repositories/xtream_repository.dart';
import 'vod_genre_cache.dart';

/// Fetches missing movie genres via `get_vod_info` and caches them locally.
class VodGenreIndexer {
  VodGenreIndexer({
    required this.repository,
    required this.cache,
    required this.accountKey,
    this.batchSize = 20,
  });

  final XtreamRepository repository;
  final VodGenreCache cache;
  final String accountKey;
  final int batchSize;

  bool _cancelled = false;

  void cancel() => _cancelled = true;

  /// Returns the full genre map (cached + newly fetched).
  Future<Map<int, String>> indexMissing({
    required List<VodItem> movies,
    void Function(int completed, int total, Map<int, String> genres)? onProgress,
  }) async {
    final cached = await cache.load(accountKey);
    final missing = movies
        .where((m) => m.streamId != null && !cached.containsKey(m.streamId))
        .toList();
    final total = missing.length;

    onProgress?.call(0, total, Map.unmodifiable(cached));
    if (total == 0) {
      return cached;
    }

    var completed = 0;
    for (var i = 0; i < missing.length; i += batchSize) {
      if (_cancelled) {
        break;
      }

      final batch = missing.skip(i).take(batchSize).toList();
      final updates = <int, String>{};

      await Future.wait(
        batch.map((movie) async {
          final streamId = movie.streamId;
          if (streamId == null) {
            return;
          }
          try {
            final info = await repository.getVodInfo(movie);
            final genre = info.info.genre?.trim();
            if (genre != null && genre.isNotEmpty) {
              updates[streamId] = genre;
            }
          } catch (_) {
            // Skip titles the provider won't detail.
          }
        }),
      );

      if (_cancelled) {
        break;
      }

      if (updates.isNotEmpty) {
        await cache.merge(accountKey, updates);
        cached.addAll(updates);
      }

      completed += batch.length;
      onProgress?.call(completed, total, Map.unmodifiable(cached));
    }

    return cached;
  }
}
