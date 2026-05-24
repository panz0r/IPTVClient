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
  });

  final String title;
  final String url;
  final List<String> fallbackUrls;
  final PlaybackKind kind;
  final int? streamId;

  List<String> get allUrls => [url, ...fallbackUrls];

  bool get isLive => kind == PlaybackKind.live;
}
