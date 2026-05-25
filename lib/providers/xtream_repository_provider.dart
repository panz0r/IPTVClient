import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/repositories/xtream_repository.dart';
import 'auth_provider.dart';

final xtreamRepositoryProvider = Provider<XtreamRepository?>((ref) {
  return ref.watch(authProvider).repository;
});
