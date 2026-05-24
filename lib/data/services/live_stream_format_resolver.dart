/// Chooses live stream container order from Xtream `allowed_output_formats`.
class LiveStreamFormatResolver {
  static const defaultFormats = ['ts', 'm3u8'];

  static const _preferredOrder = ['ts', 'm3u8', 'mkv', 'mp4', 'rtmp'];

  /// Returns formats to try for live playback, most likely first.
  static List<String> resolve(List<String>? allowedOutputFormats) {
    if (allowedOutputFormats == null || allowedOutputFormats.isEmpty) {
      return List<String>.from(defaultFormats);
    }

    final normalized = allowedOutputFormats
        .map((format) => format.trim().toLowerCase())
        .where((format) => format.isNotEmpty)
        .toSet();

    if (normalized.isEmpty) {
      return List<String>.from(defaultFormats);
    }

    final ordered = <String>[];
    for (final format in _preferredOrder) {
      if (normalized.contains(format)) {
        ordered.add(format);
      }
    }
    for (final format in normalized) {
      if (!ordered.contains(format)) {
        ordered.add(format);
      }
    }
    return ordered;
  }
}
