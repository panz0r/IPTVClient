import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/models/playback_request.dart';
import 'package:iptv/data/models/watch_history_entry.dart';
import 'package:iptv/data/services/watch_history_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('upsert dedupes by contentKey and keeps most recent first', () async {
    final store = WatchHistoryStore(
      preferences: await SharedPreferences.getInstance(),
    );
    const accountKey = 'http://host|user';

    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'vod:1',
        kind: PlaybackKind.vod,
        title: 'Movie A',
        url: 'http://example/a',
        positionMs: 1000,
        updatedAt: DateTime(2024, 1, 1),
      ),
    );
    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'vod:2',
        kind: PlaybackKind.vod,
        title: 'Movie B',
        url: 'http://example/b',
        updatedAt: DateTime(2024, 1, 2),
      ),
    );
    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'vod:1',
        kind: PlaybackKind.vod,
        title: 'Movie A',
        url: 'http://example/a',
        positionMs: 90000,
        durationMs: 120000,
        updatedAt: DateTime(2024, 1, 3),
      ),
    );

    final entries = await store.load(accountKey);
    expect(entries.length, 2);
    expect(entries.first.contentKey, 'vod:1');
    expect(entries.first.positionMs, 90000);
    expect(entries.first.durationMs, 120000);
  });

  test('entries are scoped per accountKey', () async {
    final store = WatchHistoryStore(
      preferences: await SharedPreferences.getInstance(),
    );

    await store.upsert(
      WatchHistoryEntry(
        accountKey: 'a|u1',
        contentKey: 'vod:1',
        kind: PlaybackKind.vod,
        title: 'One',
        url: 'http://one',
      ),
    );
    await store.upsert(
      WatchHistoryEntry(
        accountKey: 'b|u2',
        contentKey: 'vod:1',
        kind: PlaybackKind.vod,
        title: 'Two',
        url: 'http://two',
      ),
    );

    expect((await store.load('a|u1')).single.title, 'One');
    expect((await store.load('b|u2')).single.title, 'Two');
  });

  test('clearForKind keeps other content types', () async {
    final store = WatchHistoryStore(
      preferences: await SharedPreferences.getInstance(),
    );
    const accountKey = 'http://host|user';

    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'vod:1',
        kind: PlaybackKind.vod,
        title: 'Movie',
        url: 'http://example/movie',
      ),
    );
    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'series:1:ep:2',
        kind: PlaybackKind.series,
        title: 'Show S01E02',
        url: 'http://example/ep',
      ),
    );

    final all = await store.load(accountKey);
    final moviesOnly =
        all.where((e) => e.kind == PlaybackKind.vod).toList(growable: false);
    await store.save(accountKey, moviesOnly);

    final remaining = await store.load(accountKey);
    expect(remaining.length, 1);
    expect(remaining.single.kind, PlaybackKind.vod);
    expect(remaining.single.title, 'Movie');
  });

  test('positionMs is persisted and restored on entry', () async {
    final store = WatchHistoryStore(
      preferences: await SharedPreferences.getInstance(),
    );
    const accountKey = 'http://host|user';

    await store.upsert(
      WatchHistoryEntry(
        accountKey: accountKey,
        contentKey: 'vod:99',
        kind: PlaybackKind.vod,
        title: 'Film',
        url: 'http://example/stream',
        positionMs: 1_245_000,
        durationMs: 3_600_000,
      ),
    );

    final loaded = await store.load(accountKey);
    expect(loaded.single.positionMs, 1_245_000);
    expect(loaded.single.hasResumePosition, isTrue);
    expect(loaded.single.toPlaybackRequest().shouldResume, isTrue);
    expect(loaded.single.toPlaybackRequest().resumePositionMs, 1_245_000);
  });
}
