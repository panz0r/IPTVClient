import 'package:http/http.dart' as http;

/// HTTP client with headers commonly accepted by IPTV panels behind Cloudflare.
class IptvHttpClient extends http.BaseClient {
  IptvHttpClient({http.Client? inner}) : _inner = inner ?? http.Client();

  final http.Client _inner;

  static const defaultHeaders = <String, String>{
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip',
    'Connection': 'keep-alive',
  };

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    defaultHeaders.forEach((key, value) {
      request.headers.putIfAbsent(key, () => value);
    });
    return _inner.send(request);
  }

  @override
  void close() {
    _inner.close();
  }
}
