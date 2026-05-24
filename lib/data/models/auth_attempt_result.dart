import 'account_status.dart';

class AuthAttemptResult {
  const AuthAttemptResult({
    required this.success,
    required this.debugLog,
    this.summary,
    this.accountStatus,
    this.allowedOutputFormats,
  });

  final bool success;
  final String? summary;
  final String debugLog;
  final AccountStatus? accountStatus;

  /// From `user_info.allowed_output_formats` when present.
  final List<String>? allowedOutputFormats;
}
