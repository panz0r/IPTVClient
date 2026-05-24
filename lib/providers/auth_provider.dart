import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/account_status.dart';
import '../data/models/xtream_credentials.dart';
import '../data/repositories/xtream_repository.dart';
import '../data/services/credentials_store.dart';
import '../data/services/server_url_normalizer.dart';
import 'login_form_provider.dart';
import 'content_providers.dart';

enum AuthStatus {
  unknown,
  loading,
  authenticated,
  unauthenticated,
}

class AuthState {
  const AuthState({
    required this.status,
    this.repository,
    this.errorMessage,
    this.debugLog,
    this.accountStatus,
  });

  const AuthState.unknown() : this(status: AuthStatus.unknown);

  const AuthState.loading({String? debugLog})
      : this(status: AuthStatus.loading, repository: null, debugLog: debugLog);

  const AuthState.authenticated(
    XtreamRepository repository, {
    AccountStatus? accountStatus,
  }) : this(
          status: AuthStatus.authenticated,
          repository: repository,
          accountStatus: accountStatus,
        );

  const AuthState.unauthenticated({
    String? errorMessage,
    String? debugLog,
    AccountStatus? accountStatus,
  }) : this(
          status: AuthStatus.unauthenticated,
          errorMessage: errorMessage,
          debugLog: debugLog,
          accountStatus: accountStatus,
        );

  final AuthStatus status;
  final XtreamRepository? repository;
  final String? errorMessage;
  final String? debugLog;
  final AccountStatus? accountStatus;

  bool get isAuthenticated => status == AuthStatus.authenticated;
}

final credentialsStoreProvider = Provider<CredentialsStore>(
  (ref) => CredentialsStore(),
);

final authProvider = NotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

class AuthNotifier extends Notifier<AuthState> {
  XtreamRepository? _repository;

  @override
  AuthState build() {
    Future.microtask(tryAutoConnect);
    return const AuthState.unknown();
  }

  XtreamRepository? get repository => _repository;

  Future<void> tryAutoConnect() async {
    if (state.status == AuthStatus.loading ||
        state.status == AuthStatus.authenticated) {
      return;
    }

    state = const AuthState.loading();

    final credentials = await ref.read(credentialsStoreProvider).load();
    if (credentials == null) {
      state = const AuthState.unauthenticated();
      return;
    }

    ref.read(loginFormProvider.notifier).setAll(
          serverUrl: credentials.serverUrl,
          username: credentials.username,
          password: credentials.password,
        );

    await _connect(credentials, persist: false);
  }

  Future<void> login({
    required String serverUrl,
    required String username,
    required String password,
  }) async {
    state = const AuthState.loading(
      debugLog: 'Connecting...\n',
    );

    final credentials = XtreamCredentials(
      serverUrl: serverUrl,
      username: username,
      password: password,
    );

    await _connect(credentials, persist: true);
  }

  Future<void> logout() async {
    _repository?.close();
    _repository = null;
    await ref.read(credentialsStoreProvider).clear();
    invalidateContentProviders(ref);
    state = const AuthState.unauthenticated();
  }

  Future<void> _connect(
    XtreamCredentials credentials, {
    required bool persist,
  }) async {
    XtreamRepository? repository;

    try {
      final normalizedServer =
          ServerUrlNormalizer.normalize(credentials.serverUrl);
      final normalizedCredentials = XtreamCredentials(
        serverUrl: normalizedServer,
        username: credentials.username,
        password: credentials.password,
      );

      repository = XtreamRepository.fromCredentials(normalizedCredentials);
      final attempt = await repository.authenticateWithDebug(
        originalServerInput: credentials.serverUrl,
      );

      if (!attempt.success) {
        repository.close();
        ref.read(loginFormProvider.notifier).setAll(
              serverUrl: credentials.serverUrl,
              username: credentials.username,
              password: credentials.password,
            );
        state = AuthState.unauthenticated(
          errorMessage: attempt.summary ??
              'Connection failed. Check your credentials and try again.',
          debugLog: attempt.debugLog,
          accountStatus: attempt.accountStatus,
        );
        return;
      }

      if (persist) {
        await ref.read(credentialsStoreProvider).save(normalizedCredentials);
      }

      _repository?.close();
      _repository = repository;
      repository.setAllowedOutputFormats(attempt.allowedOutputFormats);
      invalidateContentProviders(ref);
      state = AuthState.authenticated(
        repository,
        accountStatus: attempt.accountStatus,
      );
    } catch (error, stackTrace) {
      repository?.close();
      ref.read(loginFormProvider.notifier).setAll(
            serverUrl: credentials.serverUrl,
            username: credentials.username,
            password: credentials.password,
          );
      state = AuthState.unauthenticated(
        errorMessage: _humanizeError(error),
        debugLog: _formatUnexpectedError(error, stackTrace),
      );
    }
  }

  String _formatUnexpectedError(Object error, StackTrace stackTrace) {
    return [
      '=== IPTV Login Debug ===',
      'Timestamp: ${DateTime.now().toIso8601String()}',
      '',
      '--- Unexpected error ---',
      error.toString(),
      '',
      'Stack trace:',
      stackTrace.toString(),
      '',
      'Result: FAILED',
    ].join('\n');
  }

  String _humanizeError(Object error) {
    final message = error.toString();
    if (message.contains('SocketException') ||
        message.contains('Failed host lookup')) {
      return 'Could not reach the server. Check the URL and your connection.';
    }
    if (message.contains('401') || message.contains('403')) {
      return 'Invalid username or password.';
    }
  return 'Connection failed. Check your credentials and try again.';
  }
}

final xtreamRepositoryProvider = Provider<XtreamRepository?>((ref) {
  return ref.watch(authProvider).repository;
});
