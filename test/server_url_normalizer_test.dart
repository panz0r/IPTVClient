import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/server_url_normalizer.dart';

void main() {
  test('strips player_api.php from pasted URL', () {
    expect(
      ServerUrlNormalizer.normalize(
        'http://cf.panda1.online/player_api.php',
      ),
      'http://cf.panda1.online',
    );
  });

  test('preserves port', () {
    expect(
      ServerUrlNormalizer.normalize('http://example.com:8080/player_api.php'),
      'http://example.com:8080',
    );
  });

  test('adds http scheme when missing', () {
    expect(
      ServerUrlNormalizer.normalize('example.com:8080'),
      'http://example.com:8080',
    );
  });
}
