import type { AdminRole, AdminStatus } from '@/lib/admin/access';

export const ADMIN_ACCOUNT_ROLES = ['super_admin', 'admin', 'moderator'] as const;
export const ADMIN_ACCOUNT_STATUSES = ['active', 'suspended', 'revoked'] as const;
export const ADMIN_ACCOUNT_ACTION_TYPES = ['created', 'role_changed', 'suspended', 'reactivated', 'revoked'] as const;
export const ADMIN_ACCOUNT_ROLE_FILTERS = ['all', ...ADMIN_ACCOUNT_ROLES] as const;
export const ADMIN_ACCOUNT_STATUS_FILTERS = ['all', ...ADMIN_ACCOUNT_STATUSES] as const;
export const ADMIN_ACCOUNT_SORT_KEYS = ['created_at', 'updated_at', 'role', 'status'] as const;
export const ADMIN_ACCOUNT_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type AdminAccountRole = AdminRole;
export type AdminAccountStatus = AdminStatus;
export type AdminAccountActionType = (typeof ADMIN_ACCOUNT_ACTION_TYPES)[number];
export type AdminAccountRoleFilter = (typeof ADMIN_ACCOUNT_ROLE_FILTERS)[number];
export type AdminAccountStatusFilter = (typeof ADMIN_ACCOUNT_STATUS_FILTERS)[number];
export type AdminAccountSortKey = (typeof ADMIN_ACCOUNT_SORT_KEYS)[number];
export type AdminAccountSortDirection = (typeof ADMIN_ACCOUNT_SORT_DIRECTIONS)[number];

export type AdminAccountSummary = {
  totalAdminCount: string;
  activeAdminCount: string;
  suspendedAdminCount: string;
  revokedAdminCount: string;
  superAdminCount: string;
  activeSuperAdminCount: string;
};

export type AdminAccount = {
  userId: string;
  role: AdminAccountRole;
  status: AdminAccountStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  revokedAt: string | null;
  email: string | null;
  nickname: string | null;
};

export type AdminAccountSnapshot = {
  userId: string | null;
  email: string | null;
  nickname: string | null;
  role: AdminAccountRole | null;
  status: AdminAccountStatus | null;
};

export type AdminAccountAction = {
  id: string;
  requestId: string;
  requestFingerprint: string;
  actionType: AdminAccountActionType;
  actorUserId: string | null;
  actorSnapshot: AdminAccountSnapshot;
  previousRole: AdminAccountRole | null;
  newRole: AdminAccountRole | null;
  previousStatus: AdminAccountStatus | null;
  newStatus: AdminAccountStatus | null;
  reason: string | null;
  createdAt: string;
  targetSnapshot: AdminAccountSnapshot;
};

export type AdminAccountWriteResult = {
  actionId: string;
  targetUserId: string;
  role: AdminAccountRole;
  status: AdminAccountStatus;
  updatedAt: string;
};

export type AdminAccountActionState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
  requestId?: string;
  requestIdConflict?: boolean;
  targetUserId?: string;
};

export const ADMIN_ACCOUNT_STATUS_LABELS: Record<AdminAccountStatus, string> = {
  active: '활성',
  suspended: '정지',
  revoked: '회수',
};

export const ADMIN_ACCOUNT_ACTION_LABELS: Record<AdminAccountActionType, string> = {
  created: '계정 생성',
  role_changed: '역할 변경',
  suspended: '계정 정지',
  reactivated: '계정 재활성화',
  revoked: '계정 회수',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_FINGERPRINT_PATTERN = /^[0-9a-f]{32}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
);

const isNullableTimestamp = (value: unknown): value is string | null => (
  value === null || isTimestamp(value)
);

const parseCount = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? value : null;
};

export const isAdminAccountUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

export const isAdminAccountTimestamp = isTimestamp;

export const isAdminAccountRole = (value: unknown): value is AdminAccountRole => (
  typeof value === 'string' && ADMIN_ACCOUNT_ROLES.includes(value as AdminAccountRole)
);

export const isAdminAccountStatus = (value: unknown): value is AdminAccountStatus => (
  typeof value === 'string' && ADMIN_ACCOUNT_STATUSES.includes(value as AdminAccountStatus)
);

export const isAdminAccountActionType = (value: unknown): value is AdminAccountActionType => (
  typeof value === 'string' && ADMIN_ACCOUNT_ACTION_TYPES.includes(value as AdminAccountActionType)
);

export const isAdminAccountRoleFilter = (value: unknown): value is AdminAccountRoleFilter => (
  typeof value === 'string' && ADMIN_ACCOUNT_ROLE_FILTERS.includes(value as AdminAccountRoleFilter)
);

export const isAdminAccountStatusFilter = (value: unknown): value is AdminAccountStatusFilter => (
  typeof value === 'string' && ADMIN_ACCOUNT_STATUS_FILTERS.includes(value as AdminAccountStatusFilter)
);

export const isAdminAccountSortKey = (value: unknown): value is AdminAccountSortKey => (
  typeof value === 'string' && ADMIN_ACCOUNT_SORT_KEYS.includes(value as AdminAccountSortKey)
);

export const isAdminAccountSortDirection = (value: unknown): value is AdminAccountSortDirection => (
  typeof value === 'string' && ADMIN_ACCOUNT_SORT_DIRECTIONS.includes(value as AdminAccountSortDirection)
);

const parseNullableRole = (value: unknown): AdminAccountRole | null | undefined => (
  value === null ? null : isAdminAccountRole(value) ? value : undefined
);

const parseNullableStatus = (value: unknown): AdminAccountStatus | null | undefined => (
  value === null ? null : isAdminAccountStatus(value) ? value : undefined
);

const parseSnapshot = (value: unknown): AdminAccountSnapshot | null => {
  if (!isRecord(value)) return null;
  const userId = value.user_id === undefined || value.user_id === null
    ? null : isAdminAccountUuid(value.user_id) ? value.user_id : undefined;
  const email = value.email === undefined || value.email === null
    ? null : typeof value.email === 'string' ? value.email : undefined;
  const nickname = value.nickname === undefined || value.nickname === null
    ? null : typeof value.nickname === 'string' ? value.nickname : undefined;
  const role = value.role === undefined ? null : parseNullableRole(value.role);
  const status = value.status === undefined ? null : parseNullableStatus(value.status);
  if (userId === undefined || email === undefined || nickname === undefined || role === undefined || status === undefined) {
    return null;
  }
  return { userId, email, nickname, role, status };
};

const parseAccount = (value: unknown): AdminAccount | null => {
  if (!isRecord(value)) return null;
  if (
    !isAdminAccountUuid(value.user_id)
    || !isAdminAccountRole(value.role)
    || !isAdminAccountStatus(value.status)
    || !(value.created_by === null || isAdminAccountUuid(value.created_by))
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || !isNullableTimestamp(value.suspended_at)
    || !isNullableTimestamp(value.revoked_at)
    || !isNullableString(value.email)
    || !isNullableString(value.nickname)
  ) return null;
  if (
    (value.status === 'active' && (value.suspended_at !== null || value.revoked_at !== null))
    || (value.status === 'suspended' && (value.suspended_at === null || value.revoked_at !== null))
    || (value.status === 'revoked' && value.revoked_at === null)
  ) return null;
  return {
    userId: value.user_id,
    role: value.role,
    status: value.status,
    createdBy: value.created_by,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    suspendedAt: value.suspended_at,
    revokedAt: value.revoked_at,
    email: value.email,
    nickname: value.nickname,
  };
};

export const parseAdminAccountSummary = (value: unknown): AdminAccountSummary | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const counts = [
    row.total_admin_count,
    row.active_admin_count,
    row.suspended_admin_count,
    row.revoked_admin_count,
    row.super_admin_count,
    row.active_super_admin_count,
  ].map(parseCount);
  if (counts.some((count) => count === null)) return null;
  return {
    totalAdminCount: counts[0]!,
    activeAdminCount: counts[1]!,
    suspendedAdminCount: counts[2]!,
    revokedAdminCount: counts[3]!,
    superAdminCount: counts[4]!,
    activeSuperAdminCount: counts[5]!,
  };
};

export const parseAdminAccountList = (value: unknown): AdminAccount[] | null => {
  if (!Array.isArray(value)) return null;
  const accounts: AdminAccount[] = [];
  for (const entry of value) {
    const account = parseAccount(entry);
    if (!account) return null;
    accounts.push(account);
  }
  return accounts;
};

export const parseAdminAccountDetail = (value: unknown): AdminAccount | null => {
  if (!Array.isArray(value) || value.length !== 1) return null;
  return parseAccount(value[0]);
};

export const parseAdminAccountActions = (value: unknown): AdminAccountAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: AdminAccountAction[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const actorSnapshot = parseSnapshot(entry.actor_snapshot);
    const targetSnapshot = parseSnapshot(entry.target_snapshot);
    const previousRole = parseNullableRole(entry.previous_role);
    const newRole = parseNullableRole(entry.new_role);
    const previousStatus = parseNullableStatus(entry.previous_status);
    const newStatus = parseNullableStatus(entry.new_status);
    if (
      !isAdminAccountUuid(entry.id)
      || !isAdminAccountUuid(entry.request_id)
      || typeof entry.request_fingerprint !== 'string'
      || !REQUEST_FINGERPRINT_PATTERN.test(entry.request_fingerprint)
      || !isAdminAccountActionType(entry.action_type)
      || !(entry.actor_user_id === null || isAdminAccountUuid(entry.actor_user_id))
      || !actorSnapshot
      || previousRole === undefined
      || newRole === undefined
      || previousStatus === undefined
      || newStatus === undefined
      || !(entry.reason === null || (
        typeof entry.reason === 'string'
        && entry.reason.trim() === entry.reason
        && entry.reason.length <= 500
      ))
      || !isTimestamp(entry.created_at)
      || !targetSnapshot
    ) return null;
    actions.push({
      id: entry.id,
      requestId: entry.request_id,
      requestFingerprint: entry.request_fingerprint,
      actionType: entry.action_type,
      actorUserId: entry.actor_user_id,
      actorSnapshot,
      previousRole,
      newRole,
      previousStatus,
      newStatus,
      reason: entry.reason,
      createdAt: entry.created_at,
      targetSnapshot,
    });
  }
  return actions;
};

export const parseAdminAccountWriteResult = (
  value: unknown,
  expectedTargetUserId: string,
): AdminAccountWriteResult | null => {
  if (!isAdminAccountUuid(expectedTargetUserId) || !Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return null;
  }
  const row = value[0];
  if (
    !isAdminAccountUuid(row.action_id)
    || !isAdminAccountUuid(row.target_user_id)
    || row.target_user_id.toLowerCase() !== expectedTargetUserId.toLowerCase()
    || !isAdminAccountRole(row.role)
    || !isAdminAccountStatus(row.status)
    || !isTimestamp(row.updated_at)
  ) return null;
  return {
    actionId: row.action_id,
    targetUserId: row.target_user_id,
    role: row.role,
    status: row.status,
    updatedAt: row.updated_at,
  };
};

export const getAdminAccountRoleClassName = (role: AdminAccountRole): string => {
  if (role === 'super_admin') return 'bg-purple-100 text-purple-800';
  if (role === 'admin') return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-700';
};

export const getAdminAccountStatusClassName = (status: AdminAccountStatus): string => {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'suspended') return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
};

export const getAdminAccountActionClassName = (actionType: AdminAccountActionType): string => {
  if (actionType === 'created' || actionType === 'reactivated') return 'bg-green-100 text-green-800';
  if (actionType === 'role_changed') return 'bg-blue-100 text-blue-800';
  if (actionType === 'suspended') return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
};
