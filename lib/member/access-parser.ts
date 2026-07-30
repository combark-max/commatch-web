export type MemberAccountStatus = 'active' | 'suspended';
export type MemberProfileVisibility = 'visible' | 'hidden';

export type MemberAccess = {
  isAuthenticated: true;
  isAllowed: boolean;
  accountStatus: MemberAccountStatus;
  profileVisibility: MemberProfileVisibility;
  suspendedUntil: string | null;
  reason: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableDateString = (value: unknown): value is string | null => (
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
);

export function parseMemberAccessRpcResponse(value: unknown): MemberAccess | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  if (
    typeof row.is_allowed !== 'boolean'
    || (row.account_status !== 'active' && row.account_status !== 'suspended')
    || (row.profile_visibility !== 'visible' && row.profile_visibility !== 'hidden')
    || !isNullableDateString(row.suspended_until)
    || !isNullableString(row.reason)
    || (row.is_allowed === false && row.account_status !== 'suspended')
  ) {
    return null;
  }

  return {
    isAuthenticated: true,
    isAllowed: row.is_allowed,
    accountStatus: row.account_status,
    profileVisibility: row.profile_visibility,
    suspendedUntil: row.suspended_until,
    reason: row.reason,
  };
}
