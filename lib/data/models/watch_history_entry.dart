import 'playback_request.dart';

class WatchHistoryEntry {
  const WatchHistoryEntry({
    required this.accountKey,
    required this.contentKey,
    required this.kind,
    required this.title,
    required this.url,
    this.fallbackUrls = const [],
    this.imageUrl,
    this.positionMs = 0,
    this.durationMs,
    this.updatedAt,
    this.vodStreamId,
    this.seriesId,
    this.episodeId,
    this.seriesTitle,
    this.subtitle,
  });

  final String accountKey;
  final String contentKey;
  final PlaybackKind kind;
  final String title;
  final String url;
  final List<String> fallbackUrls;
  final String? imageUrl;
  final int positionMs;
  final int? durationMs;
  final DateTime? updatedAt;
  final int? vodStreamId;
  final int? seriesId;
  final int? episodeId;
  final String? seriesTitle;
  final String? subtitle;

  double? get progressFraction {
    if (durationMs == null || durationMs! <= 0) {
      return null;
    }
    return (positionMs / durationMs!).clamp(0.0, 1.0);
  }

  bool get hasResumePosition => positionMs > 5000;

  PlaybackRequest toPlaybackRequest() {
    return PlaybackRequest(
      title: title,
      url: url,
      fallbackUrls: fallbackUrls,
      kind: kind,
      streamId: vodStreamId,
      contentKey: contentKey,
      imageUrl: imageUrl,
      resumePositionMs: positionMs,
      vodStreamId: vodStreamId,
      seriesId: seriesId,
      episodeId: episodeId,
      seriesTitle: seriesTitle,
    );
  }

  WatchHistoryEntry copyWith({
    String? title,
    String? url,
    List<String>? fallbackUrls,
    String? imageUrl,
    int? positionMs,
    int? durationMs,
    DateTime? updatedAt,
  }) {
    return WatchHistoryEntry(
      accountKey: accountKey,
      contentKey: contentKey,
      kind: kind,
      title: title ?? this.title,
      url: url ?? this.url,
      fallbackUrls: fallbackUrls ?? this.fallbackUrls,
      imageUrl: imageUrl ?? this.imageUrl,
      positionMs: positionMs ?? this.positionMs,
      durationMs: durationMs ?? this.durationMs,
      updatedAt: updatedAt ?? this.updatedAt,
      vodStreamId: vodStreamId,
      seriesId: seriesId,
      episodeId: episodeId,
      seriesTitle: seriesTitle,
      subtitle: subtitle,
    );
  }

  Map<String, dynamic> toJson() => {
        'accountKey': accountKey,
        'contentKey': contentKey,
        'kind': kind.name,
        'title': title,
        'url': url,
        'fallbackUrls': fallbackUrls,
        'imageUrl': imageUrl,
        'positionMs': positionMs,
        'durationMs': durationMs,
        'updatedAt': updatedAt?.toIso8601String(),
        'vodStreamId': vodStreamId,
        'seriesId': seriesId,
        'episodeId': episodeId,
        'seriesTitle': seriesTitle,
        'subtitle': subtitle,
      };

  factory WatchHistoryEntry.fromJson(Map<String, dynamic> json) {
    return WatchHistoryEntry(
      accountKey: json['accountKey'] as String,
      contentKey: json['contentKey'] as String,
      kind: PlaybackKind.values.byName(json['kind'] as String),
      title: json['title'] as String,
      url: json['url'] as String,
      fallbackUrls: (json['fallbackUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      imageUrl: json['imageUrl'] as String?,
      positionMs: json['positionMs'] as int? ?? 0,
      durationMs: json['durationMs'] as int?,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      vodStreamId: json['vodStreamId'] as int?,
      seriesId: json['seriesId'] as int?,
      episodeId: json['episodeId'] as int?,
      seriesTitle: json['seriesTitle'] as String?,
      subtitle: json['subtitle'] as String?,
    );
  }

  static String vodContentKey(int streamId) => 'vod:$streamId';

  static String seriesEpisodeContentKey(int seriesId, int episodeId) =>
      'series:$seriesId:ep:$episodeId';

  static String accountKeyFor(String serverUrl, String username) =>
      '$serverUrl|$username';
}
