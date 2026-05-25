import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Persists movie streamId → genre label (from `get_vod_info`) per account.
class VodGenreCache {
  VodGenreCache({SharedPreferences? preferences})
      : _preferencesFuture = preferences != null
            ? Future.value(preferences)
            : SharedPreferences.getInstance();

  static const _keyPrefix = 'vod_genre_cache_';

  final Future<SharedPreferences> _preferencesFuture;

  Future<Map<int, String>> load(String accountKey) async {
    final prefs = await _preferencesFuture;
    final raw = prefs.getString('$_keyPrefix$accountKey');
    if (raw == null || raw.isEmpty) {
      return {};
    }

    final map = jsonDecode(raw) as Map<String, dynamic>;
    return map.map(
      (key, value) => MapEntry(int.parse(key), value as String),
    );
  }

  Future<void> merge(String accountKey, Map<int, String> genres) async {
    if (genres.isEmpty) {
      return;
    }
    final existing = await load(accountKey);
    existing.addAll(genres);
    final prefs = await _preferencesFuture;
    final encoded = existing.map((k, v) => MapEntry(k.toString(), v));
    await prefs.setString('$_keyPrefix$accountKey', jsonEncode(encoded));
  }
}
