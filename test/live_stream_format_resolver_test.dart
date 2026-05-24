import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/live_stream_format_resolver.dart';

void main() {
  group('LiveStreamFormatResolver', () {
    test('defaults to ts then m3u8 when server formats missing', () {
      expect(
        LiveStreamFormatResolver.resolve(null),
        ['ts', 'm3u8'],
      );
      expect(
        LiveStreamFormatResolver.resolve([]),
        ['ts', 'm3u8'],
      );
    });

    test('prefers ts before m3u8 when both allowed', () {
      expect(
        LiveStreamFormatResolver.resolve(['m3u8', 'ts']),
        ['ts', 'm3u8'],
      );
    });

    test('keeps only formats the server allows', () {
      expect(
        LiveStreamFormatResolver.resolve(['m3u8']),
        ['m3u8'],
      );
    });

    test('appends unknown formats after known ones', () {
      expect(
        LiveStreamFormatResolver.resolve(['rtmp', 'm3u8']),
        ['m3u8', 'rtmp'],
      );
    });
  });
}
