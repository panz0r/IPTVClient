import 'package:xtream_code_client/xtream_code_client.dart';

import '../models/playback_request.dart';
import '../models/watch_history_entry.dart';
PlaybackRequest playbackRequestForVod({
  required VodItem item,
  required String url,
  String? accountKey,
  int resumePositionMs = 0,
}) {
  final streamId = item.streamId;
  final title = item.name ?? item.title ?? 'Movie';
  return PlaybackRequest(
    title: title,
    url: url,
    kind: PlaybackKind.vod,
    streamId: streamId,
    contentKey: streamId != null
        ? WatchHistoryEntry.vodContentKey(streamId)
        : null,
    imageUrl: item.streamIcon,
    resumePositionMs: resumePositionMs,
    vodStreamId: streamId,
  );
}

PlaybackRequest playbackRequestForEpisode({
  required Episode episode,
  required String url,
  required int seriesId,
  required String seriesTitle,
  String? imageUrl,
  int resumePositionMs = 0,
}) {
  final episodeId = episode.id;
  final episodeTitle =
      episode.title ?? 'Episode ${episode.episodeNum ?? episodeId ?? ''}';
  final title = '$seriesTitle · $episodeTitle';

  return PlaybackRequest(
    title: title,
    url: url,
    kind: PlaybackKind.series,
    contentKey: episodeId != null
        ? WatchHistoryEntry.seriesEpisodeContentKey(seriesId, episodeId)
        : null,
    imageUrl: imageUrl ?? episode.info.movieImage,
    resumePositionMs: resumePositionMs,
    seriesId: seriesId,
    episodeId: episodeId,
    seriesTitle: seriesTitle,
  );
}

WatchHistoryEntry watchHistoryEntryFromRequest({
  required PlaybackRequest request,
  required String accountKey,
  int positionMs = 0,
  int? durationMs,
}) {
  if (request.contentKey == null) {
    throw ArgumentError('PlaybackRequest.contentKey is required for history.');
  }

  return WatchHistoryEntry(
    accountKey: accountKey,
    contentKey: request.contentKey!,
    kind: request.kind,
    title: request.title,
    url: request.url,
    fallbackUrls: request.fallbackUrls,
    imageUrl: request.imageUrl,
    positionMs: positionMs,
    durationMs: durationMs,
    updatedAt: DateTime.now(),
    vodStreamId: request.vodStreamId,
    seriesId: request.seriesId,
    episodeId: request.episodeId,
    seriesTitle: request.seriesTitle,
    subtitle: request.seriesTitle,
  );
}

int? resumePositionForContent({
  required List<WatchHistoryEntry> history,
  required String? contentKey,
}) {
  if (contentKey == null) {
    return null;
  }
  final entry = history.where((e) => e.contentKey == contentKey).firstOrNull;
  return entry?.hasResumePosition == true ? entry!.positionMs : null;
}
