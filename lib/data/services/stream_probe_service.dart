import 'package:http/http.dart' as http;

import 'iptv_http_client.dart';

/// HTTP probe result for a stream URL (login-style verbose log).
class StreamProbeResult {
  const StreamProbeResult({
    required this.url,
    required this.reachable,
    required this.log,
    this.statusCode,
    this.contentType,
  });

  final String url;
  final bool reachable;
  final String log;
  final int? statusCode;
  final String? contentType;
}

/// Probes stream URLs with browser-like headers (Cloudflare-friendly).
class StreamProbeService {
  StreamProbeService({http.Client? httpClient})
      : _http = httpClient ?? IptvHttpClient();

  final http.Client _http;

  Future<StreamProbeResult> probe(String url) async {
    final log = StringBuffer();
    final uri = Uri.parse(url);

    log.writeln('--- Stream URL probe ---');
    log.writeln('URL: $url');
    log.writeln('Timestamp: ${DateTime.now().toIso8601String()}');
    log.writeln('');

    for (final method in const ['HEAD', 'GET']) {
      log.writeln('Attempt: $method');
      try {
        final startedAt = DateTime.now();
        final response = method == 'HEAD'
            ? await _http.head(uri).timeout(const Duration(seconds: 20))
            : await _http
                .get(
                  uri,
                  headers: const {'Range': 'bytes=0-4095'},
                )
                .timeout(const Duration(seconds: 20));
        final duration = DateTime.now().difference(startedAt);

        log.writeln('HTTP status: ${response.statusCode}');
        log.writeln('Duration: ${duration.inMilliseconds} ms');
        if (response.isRedirect) {
          log.writeln('Redirect location: ${response.headers['location']}');
        }
        final contentType = response.headers['content-type'];
        if (contentType != null) {
          log.writeln('Content-Type: $contentType');
        }
        log.writeln('Body length (this request): ${response.bodyBytes.length} bytes');
        log.writeln('');

        final reachable = _isReachableStatus(response.statusCode);
        if (reachable) {
          log.writeln('Result: REACHABLE ($method ${response.statusCode})');
          return StreamProbeResult(
            url: url,
            reachable: true,
            log: log.toString(),
            statusCode: response.statusCode,
            contentType: contentType,
          );
        }

        log.writeln(
          'Result: HTTP ${response.statusCode} from $method (will try next method if any)',
        );
        log.writeln('');
      } on Exception catch (error) {
        log.writeln('Error: $error');
        log.writeln('');
      }
    }

    log.writeln('Result: UNREACHABLE (no successful HEAD/GET)');
    return StreamProbeResult(
      url: url,
      reachable: false,
      log: log.toString(),
    );
  }

  Future<List<StreamProbeResult>> probeAll(Iterable<String> urls) async {
    final results = <StreamProbeResult>[];
    for (final url in urls) {
      results.add(await probe(url));
    }
    return results;
  }

  static String formatProbeLog(List<StreamProbeResult> results) {
    final log = StringBuffer();
    log.writeln('=== Live stream URL probes ===');
    log.writeln('');

    for (var index = 0; index < results.length; index++) {
      log.writeln('[Candidate ${index + 1}]');
      log.writeln(results[index].log);
      if (index < results.length - 1) {
        log.writeln('');
      }
    }

    return log.toString();
  }

  static bool _isReachableStatus(int statusCode) {
    return statusCode == 200 ||
        statusCode == 206 ||
        statusCode == 301 ||
        statusCode == 302 ||
        statusCode == 307 ||
        statusCode == 308;
  }

  void close() {
    _http.close();
  }
}
