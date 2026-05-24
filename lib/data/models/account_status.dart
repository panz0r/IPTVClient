/// Result of interpreting Xtream `user_info` from `player_api.php`.
class AccountStatus {
  const AccountStatus({
    required this.kind,
    required this.title,
    required this.message,
    this.expiresAt,
    this.isTrial,
    this.maxConnections,
    this.activeConnections,
    this.rawStatus,
    this.serverMessage,
  });

  final AccountStatusKind kind;
  final String title;
  final String message;
  final DateTime? expiresAt;
  final bool? isTrial;
  final int? maxConnections;
  final int? activeConnections;
  final String? rawStatus;
  final String? serverMessage;

  bool get isUsable => kind == AccountStatusKind.active;

  String? get successSummary {
    if (!isUsable) {
      return null;
    }

    final parts = <String>[];
    if (expiresAt != null) {
      parts.add('Expires ${_formatDate(expiresAt!)}');
    }
    if (isTrial == true) {
      parts.add('Trial account');
    }
    if (maxConnections != null) {
      parts.add('Max connections: $maxConnections');
    }
    return parts.isEmpty ? null : parts.join(' · ');
  }

  static String _formatDate(DateTime date) {
    final local = date.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final h = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');
    return '$y-$m-$d $h:$min';
  }
}

enum AccountStatusKind {
  active,
  expired,
  banned,
  disabled,
  invalidCredentials,
  maxConnectionsReached,
  unknown,
}
