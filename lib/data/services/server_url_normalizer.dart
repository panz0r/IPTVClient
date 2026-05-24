/// Normalizes user-entered server URLs for Xtream-compatible APIs.
class ServerUrlNormalizer {
  static const _apiPathSuffixes = [
    'player_api.php',
    'panel_api.php',
    'get.php',
    'xmltv.php',
  ];

  /// Returns a base server URL without API paths or credential query strings.
  ///
  /// Examples:
  /// - `http://host:8080/player_api.php?user=x` -> `http://host:8080`
  /// - `cf.example.com` -> `http://cf.example.com`
  static String normalize(String raw) {
    var input = raw.trim();
    if (input.isEmpty) {
      throw ArgumentError('Server URL cannot be empty.');
    }

    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = 'http://$input';
    }

    final uri = Uri.parse(input);
    if (uri.host.isEmpty) {
      throw ArgumentError('Server URL must include a hostname.');
    }

    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    while (segments.isNotEmpty &&
        _apiPathSuffixes.contains(segments.last.toLowerCase())) {
      segments.removeLast();
    }

    final buffer = StringBuffer()
      ..write(uri.scheme)
      ..write('://')
      ..write(uri.host);

    if (uri.hasPort) {
      buffer.write(':${uri.port}');
    }

    if (segments.isNotEmpty) {
      buffer.write('/${segments.join('/')}');
    }

    var normalized = buffer.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }

    return normalized;
  }

  /// If the pasted URL included `username` / `password` query params, return them.
  static ({String? username, String? password}) extractEmbeddedCredentials(
    String raw,
  ) {
    final trimmed = raw.trim();
    if (!trimmed.contains('?')) {
      return (username: null, password: null);
    }

    try {
      final uri = Uri.parse(
        trimmed.startsWith('http') ? trimmed : 'http://$trimmed',
      );
      return (
        username: uri.queryParameters['username'],
        password: uri.queryParameters['password'],
      );
    } catch (_) {
      return (username: null, password: null);
    }
  }
}
