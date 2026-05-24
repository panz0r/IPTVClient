import '../models/account_status.dart';

/// Parses Xtream Codes `user_info` account state.
///
/// Typical `user_info` fields:
/// - `auth` — 1 if credentials accepted
/// - `status` — e.g. Active, Expired, Banned
/// - `exp_date` — Unix timestamp (seconds) when subscription ends
/// - `message` — human-readable reason when login fails
class AccountStatusParser {
  static AccountStatus fromUserInfo(Map<String, dynamic> info) {
    final auth = _readAuth(info['auth']);
    final rawStatus = info['status']?.toString().trim();
    final serverMessage = info['message']?.toString().trim();
    final expiresAt = _readExpDate(info['exp_date']);
    final isTrial = _readBool(info['is_trial']);
    final maxConnections = _readInt(info['max_connections']);
    final activeConnections = _readInt(info['active_cons']);

    final statusLower = rawStatus?.toLowerCase() ?? '';

    if (!auth) {
      return _failureFromSignals(
        kind: _kindForStatus(statusLower, serverMessage),
        rawStatus: rawStatus,
        serverMessage: serverMessage,
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
      );
    }

    if (_statusIndicatesExpired(statusLower)) {
      return _expired(
        rawStatus: rawStatus,
        serverMessage: serverMessage,
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
      );
    }

    if (_statusIndicatesBanned(statusLower)) {
      return _banned(
        rawStatus: rawStatus,
        serverMessage: serverMessage,
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
      );
    }

    if (_statusIndicatesDisabled(statusLower)) {
      return _disabled(
        rawStatus: rawStatus,
        serverMessage: serverMessage,
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
      );
    }

    if (expiresAt != null && expiresAt.isBefore(DateTime.now())) {
      return _expired(
        rawStatus: rawStatus,
        serverMessage: serverMessage,
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
      );
    }

    if (maxConnections != null &&
        activeConnections != null &&
        activeConnections >= maxConnections) {
      return AccountStatus(
        kind: AccountStatusKind.maxConnectionsReached,
        title: 'Connection limit reached',
        message:
            'This account is already using $activeConnections of $maxConnections allowed connections. '
            'Stop another device or wait and try again.',
        expiresAt: expiresAt,
        isTrial: isTrial,
        maxConnections: maxConnections,
        activeConnections: activeConnections,
        rawStatus: rawStatus,
        serverMessage: serverMessage,
      );
    }

    return AccountStatus(
      kind: AccountStatusKind.active,
      title: 'Active',
      message: 'Account is active.',
      expiresAt: expiresAt,
      isTrial: isTrial,
      maxConnections: maxConnections,
      activeConnections: activeConnections,
      rawStatus: rawStatus,
      serverMessage: serverMessage,
    );
  }

  static bool _readAuth(dynamic value) {
    return value == 1 || value == '1' || value == true || value == 'true';
  }

  static bool? _readBool(dynamic value) {
    if (value == null) {
      return null;
    }
    if (value is bool) {
      return value;
    }
    if (value == 1 || value == '1') {
      return true;
    }
    if (value == 0 || value == '0') {
      return false;
    }
    return null;
  }

  static int? _readInt(dynamic value) {
    if (value == null) {
      return null;
    }
    if (value is int) {
      return value;
    }
    return int.tryParse(value.toString());
  }

  static DateTime? _readExpDate(dynamic value) {
    if (value == null) {
      return null;
    }

    final seconds = value is int ? value : int.tryParse(value.toString());
    if (seconds == null || seconds <= 0) {
      return null;
    }

    return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
  }

  static bool _statusIndicatesExpired(String statusLower) {
    return statusLower.contains('expired') ||
        statusLower == 'exp' ||
        statusLower.contains('subscription ended');
  }

  static bool _statusIndicatesBanned(String statusLower) {
    return statusLower.contains('ban');
  }

  static bool _statusIndicatesDisabled(String statusLower) {
    return statusLower.contains('disabled') ||
        statusLower.contains('suspend') ||
        statusLower.contains('inactive');
  }

  static AccountStatusKind _kindForStatus(
    String statusLower,
    String? serverMessage,
  ) {
    final combined = '${statusLower}_${serverMessage?.toLowerCase() ?? ''}';
    if (_statusIndicatesExpired(statusLower) ||
        combined.contains('expired') ||
        combined.contains('expir')) {
      return AccountStatusKind.expired;
    }
    if (_statusIndicatesBanned(statusLower) || combined.contains('ban')) {
      return AccountStatusKind.banned;
    }
    if (_statusIndicatesDisabled(statusLower)) {
      return AccountStatusKind.disabled;
    }
    if (combined.contains('invalid') ||
        combined.contains('wrong') ||
        combined.contains('credentials')) {
      return AccountStatusKind.invalidCredentials;
    }
    return AccountStatusKind.invalidCredentials;
  }

  static AccountStatus _failureFromSignals({
    required AccountStatusKind kind,
    String? rawStatus,
    String? serverMessage,
    DateTime? expiresAt,
    bool? isTrial,
    int? maxConnections,
    int? activeConnections,
  }) {
    return switch (kind) {
      AccountStatusKind.expired => _expired(
          rawStatus: rawStatus,
          serverMessage: serverMessage,
          expiresAt: expiresAt,
          isTrial: isTrial,
          maxConnections: maxConnections,
          activeConnections: activeConnections,
        ),
      AccountStatusKind.banned => _banned(
          rawStatus: rawStatus,
          serverMessage: serverMessage,
          expiresAt: expiresAt,
          isTrial: isTrial,
          maxConnections: maxConnections,
          activeConnections: activeConnections,
        ),
      AccountStatusKind.disabled => _disabled(
          rawStatus: rawStatus,
          serverMessage: serverMessage,
          expiresAt: expiresAt,
          isTrial: isTrial,
          maxConnections: maxConnections,
          activeConnections: activeConnections,
        ),
      _ => AccountStatus(
          kind: AccountStatusKind.invalidCredentials,
          title: 'Login rejected',
          message: _composeMessage(
            fallback:
                'The server rejected these credentials (auth = 0).',
            serverMessage: serverMessage,
            rawStatus: rawStatus,
          ),
          expiresAt: expiresAt,
          isTrial: isTrial,
          maxConnections: maxConnections,
          activeConnections: activeConnections,
          rawStatus: rawStatus,
          serverMessage: serverMessage,
        ),
    };
  }

  static AccountStatus _expired({
    String? rawStatus,
    String? serverMessage,
    DateTime? expiresAt,
    bool? isTrial,
    int? maxConnections,
    int? activeConnections,
  }) {
    final expiryText = expiresAt != null
        ? ' Subscription ended ${_formatDate(expiresAt)}.'
        : '';

    return AccountStatus(
      kind: AccountStatusKind.expired,
      title: 'Subscription expired',
      message: _composeMessage(
        fallback: 'Your IPTV subscription has expired.$expiryText',
        serverMessage: serverMessage,
        rawStatus: rawStatus,
      ),
      expiresAt: expiresAt,
      isTrial: isTrial,
      maxConnections: maxConnections,
      activeConnections: activeConnections,
      rawStatus: rawStatus,
      serverMessage: serverMessage,
    );
  }

  static AccountStatus _banned({
    String? rawStatus,
    String? serverMessage,
    DateTime? expiresAt,
    bool? isTrial,
    int? maxConnections,
    int? activeConnections,
  }) {
    return AccountStatus(
      kind: AccountStatusKind.banned,
      title: 'Account banned',
      message: _composeMessage(
        fallback: 'This account has been banned by the provider.',
        serverMessage: serverMessage,
        rawStatus: rawStatus,
      ),
      expiresAt: expiresAt,
      isTrial: isTrial,
      maxConnections: maxConnections,
      activeConnections: activeConnections,
      rawStatus: rawStatus,
      serverMessage: serverMessage,
    );
  }

  static AccountStatus _disabled({
    String? rawStatus,
    String? serverMessage,
    DateTime? expiresAt,
    bool? isTrial,
    int? maxConnections,
    int? activeConnections,
  }) {
    return AccountStatus(
      kind: AccountStatusKind.disabled,
      title: 'Account disabled',
      message: _composeMessage(
        fallback: 'This account is disabled or suspended.',
        serverMessage: serverMessage,
        rawStatus: rawStatus,
      ),
      expiresAt: expiresAt,
      isTrial: isTrial,
      maxConnections: maxConnections,
      activeConnections: activeConnections,
      rawStatus: rawStatus,
      serverMessage: serverMessage,
    );
  }

  static String _composeMessage({
    required String fallback,
    String? serverMessage,
    String? rawStatus,
  }) {
    if (serverMessage != null && serverMessage.isNotEmpty) {
      return serverMessage;
    }
    if (rawStatus != null && rawStatus.isNotEmpty) {
      return '$fallback (status: $rawStatus)';
    }
    return fallback;
  }

  static String _formatDate(DateTime date) {
    final local = date.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}
