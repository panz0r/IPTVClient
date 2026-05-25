import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:xtream_code_client/xtream_code_client.dart';

import '../models/account_status.dart';
import '../models/auth_attempt_result.dart';
import '../models/xtream_credentials.dart';
import '../services/account_status_parser.dart';
import '../services/iptv_http_client.dart';
import '../services/live_stream_format_resolver.dart';
import '../services/server_url_normalizer.dart';

class XtreamRepository {
  XtreamRepository(this._client, {http.Client? httpClient})
      : _http = httpClient ?? IptvHttpClient();

  final XtreamClient _client;
  final http.Client _http;
  List<String>? _allowedOutputFormats;

  /// Output formats reported by the provider at login (`allowed_output_formats`).
  List<String>? get allowedOutputFormats => _allowedOutputFormats;

  void setAllowedOutputFormats(List<String>? formats) {
    _allowedOutputFormats = formats;
  }

  static XtreamRepository fromCredentials(XtreamCredentials credentials) {
    final httpClient = IptvHttpClient();
    final url = ServerUrlNormalizer.normalize(credentials.serverUrl);
    return XtreamRepository(
      XtreamClient(
        url: url,
        username: credentials.username,
        password: credentials.password,
        httpClient: httpClient,
      ),
      httpClient: httpClient,
    );
  }

  XtreamClient get client => _client;

  Future<GeneralInformation> authenticate() async {
    final result = await authenticateWithDebug();
    if (!result.success) {
      throw Exception(result.summary ?? 'Authentication failed.');
    }
    return _client.serverInformationData();
  }

  Future<AuthAttemptResult> authenticateWithDebug({
    String? originalServerInput,
  }) async {
    final log = StringBuffer();
    final uri = Uri.parse(_client.baseUrl);

    log.writeln('=== IPTV Login Debug ===');
    log.writeln('WARNING: This log shows credentials in plain text.');
    log.writeln('Timestamp: ${DateTime.now().toIso8601String()}');
    if (originalServerInput != null &&
        originalServerInput.trim() != ServerUrlNormalizer.normalize(
              originalServerInput,
            )) {
      log.writeln('Server field (as entered): $originalServerInput');
      log.writeln(
        'Server base URL used: ${ServerUrlNormalizer.normalize(originalServerInput)}',
      );
      log.writeln(
        '(Stripped API paths like /player_api.php from the server field if present.)',
      );
    }
    log.writeln('Exact request URI:');
    log.writeln(uri.toString());
    log.writeln('Method: GET');
    log.writeln('Request headers sent:');
    IptvHttpClient.defaultHeaders.forEach((key, value) {
      log.writeln('  $key: $value');
    });
    if (uri.hasQuery) {
      log.writeln('Query parameters sent:');
      uri.queryParameters.forEach((key, value) {
        log.writeln('  $key = $value');
      });
    }
    log.writeln('');

    try {
      final startedAt = DateTime.now();
      final response = await _http.get(uri).timeout(const Duration(seconds: 30));
      final duration = DateTime.now().difference(startedAt);

      log.writeln('--- Response ---');
      log.writeln('HTTP status: ${response.statusCode}');
      log.writeln('Duration: ${duration.inMilliseconds} ms');
      log.writeln('Body length: ${response.bodyBytes.length} bytes');
      if (response.isRedirect) {
        log.writeln('Redirect location: ${response.headers['location']}');
      }
      log.writeln('');
      log.writeln('Response headers:');
      response.headers.forEach((key, value) {
        log.writeln('  $key: $value');
      });
      log.writeln('');
      log.writeln('Response body:');
      log.writeln(_formatBody(response.body));
      log.writeln('');

      if (response.statusCode != 200) {
        log.writeln('Result: FAILED (HTTP ${response.statusCode})');
        log.writeln(_hintForStatus(response.statusCode, uri));
        return AuthAttemptResult(
          success: false,
          summary: _summaryForStatus(response.statusCode),
          debugLog: log.toString(),
        );
      }

      if (response.bodyBytes.isEmpty) {
        log.writeln('Result: FAILED (HTTP 200 but empty body)');
        return AuthAttemptResult(
          success: false,
          summary:
              'Server returned HTTP 200 with an empty body. Check server URL and port.',
          debugLog: log.toString(),
        );
      }

      final authCheck = _evaluateAuthPayload(response.body, log);
      if (!authCheck.success) {
        return AuthAttemptResult(
          success: false,
          summary: authCheck.summary,
          debugLog: log.toString(),
          accountStatus: authCheck.accountStatus,
        );
      }

      if (authCheck.allowedOutputFormats != null) {
        log.writeln(
          'allowed_output_formats: ${authCheck.allowedOutputFormats!.join(', ')}',
        );
      }

      log.writeln('Result: SUCCESS');
      return AuthAttemptResult(
        success: true,
        summary: authCheck.summary,
        debugLog: log.toString(),
        accountStatus: authCheck.accountStatus,
        allowedOutputFormats: authCheck.allowedOutputFormats,
      );
    } on Exception catch (error, stackTrace) {
      log.writeln('');
      log.writeln('--- Exception ---');
      log.writeln(error.toString());
      log.writeln('');
      log.writeln('Stack trace:');
      log.writeln(stackTrace);
      log.writeln('');
      log.writeln('Result: FAILED (request error)');

      return AuthAttemptResult(
        success: false,
        summary: _humanizeError(error),
        debugLog: log.toString(),
      );
    } catch (error, stackTrace) {
      log.writeln('');
      log.writeln('--- Unexpected error ---');
      log.writeln(error.toString());
      log.writeln('');
      log.writeln('Stack trace:');
      log.writeln(stackTrace);
      log.writeln('');
      log.writeln('Result: FAILED (unexpected error)');

      return AuthAttemptResult(
        success: false,
        summary: 'Unexpected error during login. See log for details.',
        debugLog: log.toString(),
      );
    }
  }

  Future<List<Category>> getLiveCategories() =>
      _client.liveStreamCategoriesData();

  Future<List<LiveStreamItem>> getLiveStreams({Category? category}) =>
      _client.liveStreamItemsData(category: category);

  Future<List<Category>> getVodCategories() => _client.vodCategoriesData();

  Future<List<VodItem>> getVodStreams({Category? category}) =>
      _client.vodItemsData(category: category);

  Future<List<Category>> getSeriesCategories() =>
      _client.seriesCategoriesData();

  Future<List<SeriesItem>> getSeries({Category? category}) =>
      _client.seriesItemsData(category: category);

  Future<SeriesInfo> getSeriesInfo(SeriesItem series) =>
      _client.seriesInfoData(series);

  Future<VodInfo> getVodInfo(VodItem item) => _client.vodInfoData(item);

  List<String> liveOutputFormats() =>
      LiveStreamFormatResolver.resolve(_allowedOutputFormats);

  /// Ordered candidate URLs for live playback (format fallbacks).
  List<String> buildLiveStreamUrlCandidates(LiveStreamItem item) {
    final streamId = item.streamId;
    if (streamId == null) {
      throw StateError('Live stream is missing streamId.');
    }

    if (item.directSource != null && item.directSource!.isNotEmpty) {
      return [item.directSource!];
    }

    return [
      for (final format in liveOutputFormats())
        _client.streamUrl(streamId, [format]),
    ];
  }

  String buildLiveStreamUrl(LiveStreamItem item) {
    return buildLiveStreamUrlCandidates(item).first;
  }

  String buildVodUrl(VodItem item) {
    final streamId = item.streamId;
    if (streamId == null) {
      throw StateError('VOD item is missing streamId.');
    }

    if (item.directSource != null && item.directSource!.isNotEmpty) {
      return item.directSource!;
    }

    final extension = item.containerExtension ?? 'mp4';
    return _client.movieUrl(streamId, extension);
  }

  String buildEpisodeUrl(Episode episode) {
    final episodeId = episode.id;
    if (episodeId == null) {
      throw StateError('Episode is missing id.');
    }

    if (episode.directSource != null && episode.directSource!.isNotEmpty) {
      return episode.directSource!;
    }

    final extension = episode.containerExtension ?? 'mp4';
    return _client.seriesUrl(episodeId, extension);
  }

  void close() {
    _client.close();
    _http.close();
  }

  static String _formatBody(String body) {
    if (body.trim().isEmpty) {
      return '(empty body)';
    }

    try {
      return const JsonEncoder.withIndent('  ').convert(jsonDecode(body));
    } catch (_) {
      return body;
    }
  }

  static String _summaryForStatus(int statusCode) {
    return switch (statusCode) {
      401 => 'Unauthorized (401) — wrong username or password.',
      403 => 'Forbidden (403) — server or Cloudflare blocked the request.',
      404 => 'Not found (404) — check server URL and port.',
      301 || 302 || 307 || 308 =>
        'Redirect ($statusCode) — try https:// instead of http:// (or the reverse).',
      502 || 503 || 520 || 521 || 522 =>
        'Server/gateway error ($statusCode) — provider may be down.',
      _ => 'Server returned HTTP $statusCode. See connection log.',
    };
  }

  static String _hintForStatus(int statusCode, Uri uri) {
    final hints = <String>[
      'Expected URL shape: ${uri.scheme}://host:port/player_api.php?username=...&password=...',
      'Enter only the base server in the Server URL field (e.g. http://host:8080), not /player_api.php.',
    ];

    if (statusCode == 403) {
      hints.add(
        'Cloudflare often blocks apps without a browser User-Agent — this build sends one.',
      );
    }
    if (uri.scheme == 'http') {
      hints.add('If your provider uses HTTPS, try https:// in the server URL.');
    }
    if (!uri.hasPort) {
      hints.add('Many IPTV servers require a port, e.g. :8080 or :25461.');
    }

    return hints.map((h) => 'Hint: $h').join('\n');
  }

  static _AuthPayloadCheck _evaluateAuthPayload(String body, StringBuffer log) {
    log.writeln('--- Parsed auth ---');

    dynamic decoded;
    try {
      decoded = jsonDecode(body);
    } catch (error) {
      log.writeln('JSON parse failed: $error');
      log.writeln('Result: FAILED (invalid JSON response)');
      return const _AuthPayloadCheck(
        success: false,
        summary: 'Server returned a response that is not valid JSON.',
      );
    }

    if (decoded is! Map) {
      log.writeln('Top-level JSON type: ${decoded.runtimeType}');
      log.writeln('Result: FAILED (unexpected JSON shape)');
      return const _AuthPayloadCheck(
        success: false,
        summary: 'Server returned an unexpected JSON payload.',
      );
    }

    final root = decoded.cast<String, dynamic>();
    final userInfo = root['user_info'];
    final serverInfo = root['server_info'];

    if (userInfo is Map) {
      final info = userInfo.cast<String, dynamic>();
      log.writeln('user_info:');
      info.forEach((key, value) {
        log.writeln('  $key: $value');
      });
    } else {
      log.writeln('user_info: (missing or not an object)');
    }

    if (serverInfo is Map) {
      final info = serverInfo.cast<String, dynamic>();
      log.writeln('server_info:');
      info.forEach((key, value) {
        log.writeln('  $key: $value');
      });
    } else {
      log.writeln('server_info: (missing or not an object)');
    }

    if (userInfo is! Map) {
      log.writeln('Result: FAILED (missing user_info)');
      return const _AuthPayloadCheck(
        success: false,
        summary: 'Server response did not include user_info.',
      );
    }

    final info = userInfo.cast<String, dynamic>();
    final account = AccountStatusParser.fromUserInfo(info);

    log.writeln('Account status: ${account.title}');
    log.writeln('Account message: ${account.message}');
    if (account.rawStatus != null && account.rawStatus!.isNotEmpty) {
      log.writeln('Server status field: ${account.rawStatus}');
    }
    if (account.expiresAt != null) {
      log.writeln('Expiry (exp_date): ${account.expiresAt!.toIso8601String()}');
    }
    if (account.isTrial == true) {
      log.writeln('Trial account: yes');
    }
    if (account.maxConnections != null) {
      log.writeln(
        'Connections: ${account.activeConnections ?? 0}/${account.maxConnections}',
      );
    }

    if (!account.isUsable) {
      log.writeln('Result: FAILED (${account.kind.name})');
      return _AuthPayloadCheck(
        success: false,
        summary: '${account.title}: ${account.message}',
        accountStatus: account,
      );
    }

    final username = info['username']?.toString();
    final extra = account.successSummary;
    final summary = username != null && username.isNotEmpty
        ? extra != null
            ? 'Signed in as $username · $extra'
            : 'Signed in as $username'
        : extra ?? 'Authentication successful';

    final allowedFormats = _readAllowedOutputFormats(info);
    if (allowedFormats != null) {
      log.writeln('Live formats (resolved): ${LiveStreamFormatResolver.resolve(allowedFormats).join(', ')}');
    }

    log.writeln('Result: SUCCESS');
    return _AuthPayloadCheck(
      success: true,
      summary: summary,
      accountStatus: account,
      allowedOutputFormats: allowedFormats,
    );
  }

  static List<String>? _readAllowedOutputFormats(Map<String, dynamic> info) {
    final raw = info['allowed_output_formats'];
    if (raw is! List) {
      return null;
    }

    final formats = raw
        .map((value) => value?.toString().trim() ?? '')
        .where((value) => value.isNotEmpty)
        .toList();
    return formats.isEmpty ? null : formats;
  }

  static String _humanizeError(Object error) {
    final message = error.toString();
    if (message.contains('SocketException') ||
        message.contains('Failed host lookup')) {
      return 'Could not reach the server. Check the URL and your connection.';
    }
    if (message.contains('TimeoutException')) {
      return 'The server did not respond in time.';
    }
    if (message.contains('401') || message.contains('403')) {
      return 'Invalid username or password, or access blocked.';
    }
    return 'Connection failed. See the connection log for details.';
  }
}

class _AuthPayloadCheck {
  const _AuthPayloadCheck({
    required this.success,
    this.summary,
    this.accountStatus,
    this.allowedOutputFormats,
  });

  final bool success;
  final String? summary;
  final AccountStatus? accountStatus;
  final List<String>? allowedOutputFormats;
}
