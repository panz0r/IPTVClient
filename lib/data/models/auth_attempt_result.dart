import 'account_status.dart';

class AuthAttemptResult {
  const AuthAttemptResult({
    required this.success,
    required this.debugLog,
    this.summary,
    this.accountStatus,
  });

  final bool success;
  final String? summary;
  final String debugLog;
  final AccountStatus? accountStatus;
}
