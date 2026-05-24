import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/xtream_credentials.dart';

class CredentialsStore {
  CredentialsStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'xtream_credentials';

  final FlutterSecureStorage _storage;

  Future<XtreamCredentials?> load() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) {
      return null;
    }

    return XtreamCredentials.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
  }

  Future<void> save(XtreamCredentials credentials) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(credentials.toJson()),
    );
  }

  Future<void> clear() async {
    await _storage.delete(key: _key);
  }
}
