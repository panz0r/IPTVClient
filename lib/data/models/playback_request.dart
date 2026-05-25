enum PlaybackKind {
  live,
  vod,
  series,
}

class PlaybackRequest {
  const PlaybackRequest({
    required this.title,
    required this.url,
    this.fallbackUrls = const [],
    this.kind = PlaybackKind.vod,
    this.streamId,
    this.contentKey,
    this.imageUrl,
    this.resumePositionMs = 0,
    this.vodStreamId,
    this.seriesId,
    this.episodeId,
    this.seriesTitle,
  });

  final String title;
  final String url;
  final List<String> fallbackUrls;
  final PlaybackKind kind;
  final int? streamId;
  final String? contentKey;
  final String? imageUrl;
  final int resumePositionMs;
  final int? vodStreamId;
  final int? seriesId;
  final int? episodeId;
  final String? seriesTitle;

  List<String> get allUrls => [url, ...fallbackUrls];

  bool get isLive => kind == PlaybackKind.live;

  bool get shouldResume => !isLive && resumePositionMs > 5000;
}
