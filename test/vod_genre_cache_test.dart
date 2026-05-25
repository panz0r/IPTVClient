import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/vod_genre_cache.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('merge persists genres per account', () async {
    final cache = VodGenreCache(
      preferences: await SharedPreferences.getInstance(),
    );
    const account = 'http://host|user';

    await cache.merge(account, {1: 'Horror', 2: 'Sci-Fi & Fantasy'});
    final loaded = await cache.load(account);

    expect(loaded[1], 'Horror');
    expect(loaded[2], 'Sci-Fi & Fantasy');

    await cache.merge(account, {3: 'Drama'});
    final merged = await cache.load(account);

    expect(merged.length, 3);
    expect(merged[3], 'Drama');
  });
}
