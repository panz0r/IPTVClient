export type AccountStatusKind =
  | 'active'
  | 'expired'
  | 'banned'
  | 'disabled'
  | 'invalidCredentials'
  | 'maxConnectionsReached';

export interface AccountStatus {
  kind: AccountStatusKind;
  title: string;
  message: string;
  expiresAt: Date | null;
  isTrial: boolean | null;
  maxConnections: number | null;
  activeConnections: number | null;
  rawStatus: string | null;
  serverMessage: string | null;
}

export function accountSuccessSummary(status: AccountStatus): string | null {
  if (!isAccountUsable(status)) {
    return null;
  }
  const parts: string[] = [];
  if (status.expiresAt) {
    parts.push(`expires ${formatDate(status.expiresAt)}`);
  }
  if (status.isTrial === true) {
    parts.push('trial');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function isAccountUsable(status: AccountStatus): boolean {
  return status.kind === 'active';
}

function readAuth(value: unknown): boolean {
  return value === 1 || value === '1' || value === true || value === 'true';
}

function readBool(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
}

function readInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function readExpDate(value: unknown): Date | null {
  if (value == null) return null;
  const seconds =
    typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function formatDate(date: Date): string {
  const local = new Date(date);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function composeMessage(
  fallback: string,
  serverMessage: string | null,
  rawStatus: string | null,
): string {
  if (serverMessage) return serverMessage;
  if (rawStatus) return `${fallback} (status: ${rawStatus})`;
  return fallback;
}

export function parseAccountStatus(info: Record<string, unknown>): AccountStatus {
  const auth = readAuth(info.auth);
  const rawStatus = info.status != null ? String(info.status).trim() : null;
  const serverMessage =
    info.message != null ? String(info.message).trim() : null;
  const expiresAt = readExpDate(info.exp_date);
  const isTrial = readBool(info.is_trial);
  const maxConnections = readInt(info.max_connections);
  const activeConnections = readInt(info.active_cons);
  const statusLower = (rawStatus ?? '').toLowerCase();

  const base = {
    expiresAt,
    isTrial,
    maxConnections,
    activeConnections,
    rawStatus,
    serverMessage,
  };

  if (!auth) {
    const kind = kindForStatus(statusLower, serverMessage);
    if (kind === 'expired') {
      return expiredStatus(base);
    }
    if (kind === 'banned') {
      return bannedStatus(base);
    }
    if (kind === 'disabled') {
      return disabledStatus(base);
    }
    return {
      kind: 'invalidCredentials',
      title: 'Login rejected',
      message: composeMessage(
        'The server rejected these credentials (auth = 0).',
        serverMessage,
        rawStatus,
      ),
      ...base,
    };
  }

  if (statusIndicatesExpired(statusLower)) {
    return expiredStatus(base);
  }
  if (statusIndicatesBanned(statusLower)) {
    return bannedStatus(base);
  }
  if (statusIndicatesDisabled(statusLower)) {
    return disabledStatus(base);
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return expiredStatus(base);
  }
  if (
    maxConnections != null &&
    activeConnections != null &&
    activeConnections >= maxConnections
  ) {
    return {
      kind: 'maxConnectionsReached',
      title: 'Connection limit reached',
      message: `This account is already using ${activeConnections} of ${maxConnections} allowed connections.`,
      ...base,
    };
  }

  return {
    kind: 'active',
    title: 'Active',
    message: 'Account is active.',
    ...base,
  };
}

function kindForStatus(
  statusLower: string,
  serverMessage: string | null,
): AccountStatusKind {
  const combined = `${statusLower}_${(serverMessage ?? '').toLowerCase()}`;
  if (
    statusIndicatesExpired(statusLower) ||
    combined.includes('expired') ||
    combined.includes('expir')
  ) {
    return 'expired';
  }
  if (statusIndicatesBanned(statusLower) || combined.includes('ban')) {
    return 'banned';
  }
  if (statusIndicatesDisabled(statusLower)) {
    return 'disabled';
  }
  return 'invalidCredentials';
}

function statusIndicatesExpired(s: string): boolean {
  return s.includes('expired') || s === 'exp' || s.includes('subscription ended');
}

function statusIndicatesBanned(s: string): boolean {
  return s.includes('ban');
}

function statusIndicatesDisabled(s: string): boolean {
  return (
    s.includes('disabled') || s.includes('suspend') || s.includes('inactive')
  );
}

function expiredStatus(
  base: Omit<AccountStatus, 'kind' | 'title' | 'message'>,
): AccountStatus {
  const expiryText = base.expiresAt
    ? ` Subscription ended ${formatDate(base.expiresAt)}.`
    : '';
  return {
    kind: 'expired',
    title: 'Subscription expired',
    message: composeMessage(
      `Your IPTV subscription has expired.${expiryText}`,
      base.serverMessage,
      base.rawStatus,
    ),
    ...base,
  };
}

function bannedStatus(
  base: Omit<AccountStatus, 'kind' | 'title' | 'message'>,
): AccountStatus {
  return {
    kind: 'banned',
    title: 'Account banned',
    message: composeMessage(
      'This account has been banned by the provider.',
      base.serverMessage,
      base.rawStatus,
    ),
    ...base,
  };
}

function disabledStatus(
  base: Omit<AccountStatus, 'kind' | 'title' | 'message'>,
): AccountStatus {
  return {
    kind: 'disabled',
    title: 'Account disabled',
    message: composeMessage(
      'This account is disabled or suspended.',
      base.serverMessage,
      base.rawStatus,
    ),
    ...base,
  };
}
