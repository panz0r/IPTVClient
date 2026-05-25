import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/playback_request.dart';
import '../data/models/watch_history_entry.dart';
import '../data/services/playback_helpers.dart';
import '../data/services/watch_history_store.dart';
import 'auth_provider.dart' show authProvider;
import 'credentials_provider.dart';

final watchHistoryStoreProvider = Provider<WatchHistoryStore>(
  (ref) => WatchHistoryStore(),
);

class WatchHistoryState {
  const WatchHistoryState({
    this.entries = const [],
    this.isLoading = false,
    this.accountKey,
  });

  final List<WatchHistoryEntry> entries;
  final bool isLoading;
  final String? accountKey;

  List<WatchHistoryEntry> recentlyWatchedFor(PlaybackKind kind) =>
      entries.where((e) => e.kind == kind).toList();

  List<WatchHistoryEntry> get recentlyWatchedMovies =>
      recentlyWatchedFor(PlaybackKind.vod);

  List<WatchHistoryEntry> get recentlyWatchedSeries =>
      recentlyWatchedFor(PlaybackKind.series);

  WatchHistoryState copyWith({
    List<WatchHistoryEntry>? entries,
    bool? isLoading,
    String? accountKey,
  }) {
    return WatchHistoryState(
      entries: entries ?? this.entries,
      isLoading: isLoading ?? this.isLoading,
      accountKey: accountKey ?? this.accountKey,
    );
  }
}

final watchHistoryProvider =
    NotifierProvider<WatchHistoryNotifier, WatchHistoryState>(
  WatchHistoryNotifier.new,
);

class WatchHistoryNotifier extends Notifier<WatchHistoryState> {
  @override
  WatchHistoryState build() {
    ref.listen(authProvider, (previous, next) {
      if (next.isAuthenticated) {
        _loadForCurrentAccount();
      } else if (previous?.isAuthenticated == true) {
        state = const WatchHistoryState();
      }
    });

    if (ref.read(authProvider).isAuthenticated) {
      Future.microtask(_loadForCurrentAccount);
    }

    return const WatchHistoryState(isLoading: true);
  }

  Future<String?> _currentAccountKey() async {
    final credentials = await ref.read(credentialsStoreProvider).load();
    if (credentials == null) {
      return null;
    }
    return WatchHistoryEntry.accountKeyFor(
      credentials.serverUrl,
      credentials.username,
    );
  }

  Future<void> _loadForCurrentAccount() async {
    final accountKey = await _currentAccountKey();
    if (accountKey == null) {
      state = const WatchHistoryState();
      return;
    }

    state = WatchHistoryState(isLoading: true, accountKey: accountKey);
    final entries = await ref.read(watchHistoryStoreProvider).load(accountKey);
    state = WatchHistoryState(entries: entries, accountKey: accountKey);
  }

  Future<void> reload() => _loadForCurrentAccount();

  Future<void> recordPlayback({
    required PlaybackRequest request,
    int positionMs = 0,
    int? durationMs,
  }) async {
    if (request.isLive || request.contentKey == null) {
      return;
    }

    final accountKey = state.accountKey ?? await _currentAccountKey();
    if (accountKey == null) {
      return;
    }

    final existing = state.entries
        .where((e) => e.contentKey == request.contentKey)
        .firstOrNull;

    var effectivePositionMs = positionMs;
    if (effectivePositionMs <= 5000 &&
        existing != null &&
        existing.positionMs > effectivePositionMs) {
      effectivePositionMs = existing.positionMs;
    }

    final effectiveDurationMs = durationMs ?? existing?.durationMs;

    final entry = watchHistoryEntryFromRequest(
      request: request,
      accountKey: accountKey,
      positionMs: effectivePositionMs,
      durationMs: effectiveDurationMs,
    );

    await ref.read(watchHistoryStoreProvider).upsert(entry);

    final entries = await ref.read(watchHistoryStoreProvider).load(accountKey);
    state = WatchHistoryState(entries: entries, accountKey: accountKey);
  }

  Future<void> updateProgress({
    required PlaybackRequest request,
    required int positionMs,
    int? durationMs,
  }) async {
    await recordPlayback(
      request: request,
      positionMs: positionMs,
      durationMs: durationMs,
    );
  }

  Future<void> removeEntry(String contentKey) async {
    final accountKey = state.accountKey ?? await _currentAccountKey();
    if (accountKey == null) {
      return;
    }

    await ref.read(watchHistoryStoreProvider).remove(accountKey, contentKey);
    final entries = await ref.read(watchHistoryStoreProvider).load(accountKey);
    state = WatchHistoryState(entries: entries, accountKey: accountKey);
  }

  Future<void> clearForKind(PlaybackKind kind) async {
    final accountKey = state.accountKey ?? await _currentAccountKey();
    if (accountKey == null) {
      return;
    }

    final remaining =
        state.entries.where((e) => e.kind != kind).toList(growable: false);
    await ref.read(watchHistoryStoreProvider).save(accountKey, remaining);
    state = WatchHistoryState(entries: remaining, accountKey: accountKey);
  }
}
