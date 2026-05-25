import '../models/account_status.dart';
import '../models/auth_attempt_result.dart';
import '../repositories/xtream_repository.dart';

/// Retries authentication when the panel still reports a stale connection.
Future<AuthAttemptResult> authenticateWithConnectionRetry(
  XtreamRepository repository, {
  String? originalServerInput,
  int maxRetries = 10,
  Duration retryDelay = const Duration(seconds: 2),
}) async {
  AuthAttemptResult? lastAttempt;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await Future.delayed(retryDelay);
    }

    lastAttempt = await repository.authenticateWithDebug(
      originalServerInput: originalServerInput,
    );

    if (lastAttempt.success) {
      return lastAttempt;
    }

    final status = lastAttempt.accountStatus;
    if (status?.kind != AccountStatusKind.maxConnectionsReached) {
      return lastAttempt;
    }
  }

  return lastAttempt!;
}
