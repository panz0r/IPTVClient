import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/watch_history_entry.dart';

class WatchHistoryStore {
  WatchHistoryStore({SharedPreferences? preferences})
      : _preferencesFuture = preferences != null
            ? Future.value(preferences)
            : SharedPreferences.getInstance();

  static const _keyPrefix = 'watch_history_';
  static const maxEntries = 30;

  final Future<SharedPreferences> _preferencesFuture;

  Future<List<WatchHistoryEntry>> load(String accountKey) async {
    final prefs = await _preferencesFuture;
    final raw = prefs.getString('$_keyPrefix$accountKey');
    if (raw == null || raw.isEmpty) {
      return [];
    }

    final list = jsonDecode(raw) as List<dynamic>;
    return list
        .map((e) => WatchHistoryEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> save(String accountKey, List<WatchHistoryEntry> entries) async {
    final prefs = await _preferencesFuture;
    final trimmed = entries.take(maxEntries).toList();
    await prefs.setString(
      '$_keyPrefix$accountKey',
      jsonEncode(trimmed.map((e) => e.toJson()).toList()),
    );
  }

  Future<void> upsert(WatchHistoryEntry entry) async {
    final entries = await load(entry.accountKey);
    final updated = [
      entry,
      ...entries.where((e) => e.contentKey != entry.contentKey),
    ].take(maxEntries).toList();
    await save(entry.accountKey, updated);
  }

  Future<void> remove(String accountKey, String contentKey) async {
    final entries = await load(accountKey);
    await save(
      accountKey,
      entries.where((e) => e.contentKey != contentKey).toList(),
    );
  }
}
