import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/services/credentials_store.dart';

final credentialsStoreProvider = Provider<CredentialsStore>(
  (ref) => CredentialsStore(),
);
