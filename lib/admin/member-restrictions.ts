import { isUuid } from '@/lib/admin/reports';

export const MEMBER_ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export const MEMBER_PROFILE_VISIBILITIES = ['visible', 'hidden'] as const;
export const MEMBER_RESTRICTION_ACTION_TYPES = [
  'account_suspended',
  'account_reactivated',
  'profile_hidden',
  'profile_restored',
  'suspension_updated',
  'restriction_updated',
] as const;
export const MEMBER_ACCOUNT_MODES = [
  'active',
  'suspended_indefinite',
  'suspended_until',
] as const;

export type MemberAccountStatus = (typeof MEMBER_ACCOUNT_STATUSES)[number];
export type MemberProfileVisibility = (typeof MEMBER_PROFILE_VISIBILITIES)[number];
export type MemberRestrictionActionType = (typeof MEMBER_RESTRICTION_ACTION_TYPES)[number];
export type MemberAccountMode = (typeof MEMBER_ACCOUNT_MODES)[number];

export type AdminMemberRestriction = {
  userId: string;
  profileExists: boolean;
  nickname: string | null;
  accountStatus: MemberAccountStatus;
  profileVisibility: MemberProfileVisibility;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  reason: string | null;
  adminNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

export type AdminMemberRestrictionAction = {
  actionId: string;
  actionType: MemberRestrictionActionType;
  previousAccountStatus: MemberAccountStatus;
  newAccountStatus: MemberAccountStatus;
  previousProfileVisibility: MemberProfileVisibility;
  newProfileVisibility: MemberProfileVisibility;
  previousSuspendedUntil: string | null;
  newSuspendedUntil: string | null;
  reason: string | null;
  note: string | null;
  reportId: string | null;
  adminUserId: string | null;
  adminRole: string | null;
  createdAt: string;
};

export type MemberRestrictionActionState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableUuid = (value: unknown): value is string | null => (
  value === null || isUuid(value)
);

const isDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const isNullableDateString = (value: unknown): value is string | null => (
  value === null || isDateString(value)
);

export const isMemberAccountStatus = (value: unknown): value is MemberAccountStatus => (
  typeof value === 'string'
  && MEMBER_ACCOUNT_STATUSES.includes(value as MemberAccountStatus)
);

export const isMemberProfileVisibility = (value: unknown): value is MemberProfileVisibility => (
  typeof value === 'string'
  && MEMBER_PROFILE_VISIBILITIES.includes(value as MemberProfileVisibility)
);

export const isMemberRestrictionActionType = (
  value: unknown,
): value is MemberRestrictionActionType => (
  typeof value === 'string'
  && MEMBER_RESTRICTION_ACTION_TYPES.includes(value as MemberRestrictionActionType)
);

export const isMemberAccountMode = (value: unknown): value is MemberAccountMode => (
  typeof value === 'string'
  && MEMBER_ACCOUNT_MODES.includes(value as MemberAccountMode)
);

export const parseAdminMemberRestriction = (value: unknown): AdminMemberRestriction | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (
    !isUuid(row.user_id)
    || typeof row.profile_exists !== 'boolean'
    || !isNullableString(row.nickname)
    || !isMemberAccountStatus(row.account_status)
    || !isMemberProfileVisibility(row.profile_visibility)
    || !isNullableDateString(row.suspended_at)
    || !isNullableDateString(row.suspended_until)
    || !isNullableString(row.reason)
    || !isNullableString(row.admin_note)
    || !isNullableDateString(row.created_at)
    || !isNullableDateString(row.updated_at)
    || !isNullableUuid(row.created_by)
    || !isNullableUuid(row.updated_by)
  ) return null;

  return {
    userId: row.user_id,
    profileExists: row.profile_exists,
    nickname: row.nickname,
    accountStatus: row.account_status,
    profileVisibility: row.profile_visibility,
    suspendedAt: row.suspended_at,
    suspendedUntil: row.suspended_until,
    reason: row.reason,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
};

export const parseAdminMemberRestrictionActions = (
  value: unknown,
): AdminMemberRestrictionAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: AdminMemberRestrictionAction[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.action_id)
      || !isMemberRestrictionActionType(entry.action_type)
      || !isMemberAccountStatus(entry.previous_account_status)
      || !isMemberAccountStatus(entry.new_account_status)
      || !isMemberProfileVisibility(entry.previous_profile_visibility)
      || !isMemberProfileVisibility(entry.new_profile_visibility)
      || !isNullableDateString(entry.previous_suspended_until)
      || !isNullableDateString(entry.new_suspended_until)
      || !isNullableString(entry.reason)
      || !isNullableString(entry.note)
      || !isNullableUuid(entry.report_id)
      || !isNullableUuid(entry.admin_user_id)
      || !isNullableString(entry.admin_role)
      || !isDateString(entry.created_at)
    ) return null;

    actions.push({
      actionId: entry.action_id,
      actionType: entry.action_type,
      previousAccountStatus: entry.previous_account_status,
      newAccountStatus: entry.new_account_status,
      previousProfileVisibility: entry.previous_profile_visibility,
      newProfileVisibility: entry.new_profile_visibility,
      previousSuspendedUntil: entry.previous_suspended_until,
      newSuspendedUntil: entry.new_suspended_until,
      reason: entry.reason,
      note: entry.note,
      reportId: entry.report_id,
      adminUserId: entry.admin_user_id,
      adminRole: entry.admin_role,
      createdAt: entry.created_at,
    });
  }
  return actions;
};

export const parseMemberRestrictionUpdateResult = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return false;
  const row = value[0];
  return isUuid(row.user_id)
    && isMemberAccountStatus(row.previous_account_status)
    && isMemberAccountStatus(row.new_account_status)
    && isMemberProfileVisibility(row.previous_profile_visibility)
    && isMemberProfileVisibility(row.new_profile_visibility)
    && isNullableDateString(row.previous_suspended_until)
    && isNullableDateString(row.new_suspended_until)
    && isNullableString(row.reason)
    && isNullableString(row.note)
    && isUuid(row.action_id)
    && isDateString(row.changed_at);
};

export const getMemberAccountMode = (
  accountStatus: MemberAccountStatus,
  suspendedUntil: string | null,
): MemberAccountMode => {
  if (accountStatus === 'active') return 'active';
  return suspendedUntil ? 'suspended_until' : 'suspended_indefinite';
};

export const MEMBER_ACCOUNT_STATUS_LABELS: Record<MemberAccountStatus, string> = {
  active: '정상 이용',
  suspended: '이용 정지',
};

export const MEMBER_ACCOUNT_MODE_LABELS: Record<MemberAccountMode, string> = {
  active: '정상 이용',
  suspended_indefinite: '무기한 정지',
  suspended_until: '기간 정지',
};

export const MEMBER_PROFILE_VISIBILITY_LABELS: Record<MemberProfileVisibility, string> = {
  visible: '노출 중',
  hidden: '숨김',
};

export const MEMBER_RESTRICTION_ACTION_LABELS: Record<MemberRestrictionActionType, string> = {
  account_suspended: '회원 이용 정지',
  account_reactivated: '회원 이용 재개',
  profile_hidden: '프로필 숨김',
  profile_restored: '프로필 복구',
  suspension_updated: '정지 기간 변경',
  restriction_updated: '회원 제재 변경',
};

export const isMemberCurrentlyAllowed = (restriction: AdminMemberRestriction): boolean => (
  restriction.accountStatus === 'active'
  || (
    restriction.suspendedUntil !== null
    && Date.parse(restriction.suspendedUntil) <= Date.now()
  )
);

export const toSeoulDateTimeLocal = (value: string | null): string => {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};

export const parseSeoulDateTimeLocal = (value: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const timestamp = Date.UTC(year, month - 1, day, hour - 9, minute);
  const roundTrip = toSeoulDateTimeLocal(new Date(timestamp).toISOString());
  return roundTrip === value ? new Date(timestamp).toISOString() : null;
};
