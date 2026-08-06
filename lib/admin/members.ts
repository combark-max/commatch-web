export const ADMIN_MEMBER_ACCOUNT_FILTERS = ['all', 'active', 'suspended'] as const;
export const ADMIN_MEMBER_PROFILE_FILTERS = ['all', 'missing', 'in_progress', 'completed'] as const;
export const ADMIN_MEMBER_VISIBILITY_FILTERS = ['all', 'visible', 'hidden'] as const;
export const ADMIN_MEMBER_SORT_KEYS = ['joined_at', 'nickname'] as const;
export const ADMIN_MEMBER_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const ADMIN_MEMBER_PROFILE_STATUSES = ['missing', 'in_progress', 'completed'] as const;
export const ADMIN_MEMBER_ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export const ADMIN_MEMBER_PROFILE_VISIBILITIES = ['visible', 'hidden'] as const;
export const ADMIN_MEMBER_PREMIUM_STATUSES = ['active', 'suspended', 'revoked'] as const;
export const ADMIN_MEMBER_PREMIUM_PERIOD_STATES = [
  'none',
  'not_started',
  'expired',
  'suspended',
  'revoked',
  'available',
] as const;

export type AdminMemberAccountFilter = (typeof ADMIN_MEMBER_ACCOUNT_FILTERS)[number];
export type AdminMemberProfileFilter = (typeof ADMIN_MEMBER_PROFILE_FILTERS)[number];
export type AdminMemberVisibilityFilter = (typeof ADMIN_MEMBER_VISIBILITY_FILTERS)[number];
export type AdminMemberSortKey = (typeof ADMIN_MEMBER_SORT_KEYS)[number];
export type AdminMemberSortDirection = (typeof ADMIN_MEMBER_SORT_DIRECTIONS)[number];
export type AdminMemberProfileStatus = (typeof ADMIN_MEMBER_PROFILE_STATUSES)[number];
export type AdminMemberAccountStatus = (typeof ADMIN_MEMBER_ACCOUNT_STATUSES)[number];
export type AdminMemberProfileVisibility = (typeof ADMIN_MEMBER_PROFILE_VISIBILITIES)[number];
export type AdminMemberPremiumStatus = (typeof ADMIN_MEMBER_PREMIUM_STATUSES)[number];
export type AdminMemberPremiumPeriodState = (typeof ADMIN_MEMBER_PREMIUM_PERIOD_STATES)[number];

export type AdminMemberListItem = {
  memberUserId: string;
  nickname: string | null;
  joinedAt: string;
  profileExists: boolean;
  profileStatus: AdminMemberProfileStatus;
  profileVisibility: AdminMemberProfileVisibility | null;
  storedAccountStatus: AdminMemberAccountStatus;
  currentAccountStatus: AdminMemberAccountStatus;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  premiumMembershipExists: boolean;
  premiumStoredStatus: AdminMemberPremiumStatus | null;
  premiumIsAvailable: boolean;
  premiumPeriodState: AdminMemberPremiumPeriodState;
  totalCount: number;
};

export type AdminMemberDetail = Omit<AdminMemberListItem, 'nickname' | 'totalCount'> & {
  nickname: string | null;
  gender: string | null;
  birthDate: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  religion: string | null;
  hobby: string | null;
  drinking: string | null;
  smoking: string | null;
  marriageHistory: string | null;
  introduction: string | null;
  marriageValues: string | null;
  profileImage: string | null;
  profileImages: string[] | null;
  premiumStartedAt: string | null;
  premiumExpiresAt: string | null;
};

export const ADMIN_MEMBER_PROFILE_STATUS_LABELS: Record<AdminMemberProfileStatus, string> = {
  missing: '프로필 없음',
  in_progress: '작성 중',
  completed: '작성 완료',
};

export const ADMIN_MEMBER_PROFILE_VISIBILITY_LABELS: Record<AdminMemberProfileVisibility, string> = {
  visible: '공개',
  hidden: '숨김',
};

export const ADMIN_MEMBER_ACCOUNT_STATUS_LABELS: Record<AdminMemberAccountStatus, string> = {
  active: '활성',
  suspended: '정지',
};

export const ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS: Record<AdminMemberPremiumPeriodState, string> = {
  none: 'Premium 없음',
  not_started: '시작 전',
  expired: '만료',
  suspended: '저장 상태 정지',
  revoked: '회수',
  available: '현재 이용 가능',
};

export const ADMIN_MEMBER_PREMIUM_STATUS_LABELS: Record<AdminMemberPremiumStatus, string> = {
  active: '활성',
  suspended: '정지',
  revoked: '회수',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

export const isAdminMemberUuid = isUuid;

const isTimestamptz = (value: unknown): value is string => (
  typeof value === 'string'
  && TIMESTAMPTZ_PATTERN.test(value)
  && !Number.isNaN(Date.parse(value))
);

const isNullableTimestamptz = (value: unknown): value is string | null => (
  value === null || isTimestamptz(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableDate = (value: unknown): value is string | null => {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

const isNullableInteger = (value: unknown): value is number | null => (
  value === null || typeof value === 'number' && Number.isSafeInteger(value)
);

const isNullableStringArray = (value: unknown): value is string[] | null => (
  value === null
  || Array.isArray(value) && value.every((entry) => typeof entry === 'string')
);

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T => (
  typeof value === 'string' && values.includes(value as T)
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const count = Number(value);
    return Number.isSafeInteger(count) ? count : null;
  }
  return null;
};

export const isAdminMemberAccountFilter = (value: unknown): value is AdminMemberAccountFilter => (
  isOneOf(value, ADMIN_MEMBER_ACCOUNT_FILTERS)
);

export const isAdminMemberProfileFilter = (value: unknown): value is AdminMemberProfileFilter => (
  isOneOf(value, ADMIN_MEMBER_PROFILE_FILTERS)
);

export const isAdminMemberVisibilityFilter = (
  value: unknown,
): value is AdminMemberVisibilityFilter => (
  isOneOf(value, ADMIN_MEMBER_VISIBILITY_FILTERS)
);

export const isAdminMemberSortKey = (value: unknown): value is AdminMemberSortKey => (
  isOneOf(value, ADMIN_MEMBER_SORT_KEYS)
);

export const isAdminMemberSortDirection = (
  value: unknown,
): value is AdminMemberSortDirection => (
  isOneOf(value, ADMIN_MEMBER_SORT_DIRECTIONS)
);

const parseAdminMember = (value: unknown): AdminMemberListItem | null => {
  if (!isRecord(value)) return null;

  const totalCount = parseCount(value.total_count);
  if (
    !isUuid(value.member_user_id)
    || !isNullableString(value.nickname)
    || !isTimestamptz(value.joined_at)
    || typeof value.profile_exists !== 'boolean'
    || !isOneOf(value.profile_status, ADMIN_MEMBER_PROFILE_STATUSES)
    || !(value.profile_visibility === null
      || isOneOf(value.profile_visibility, ADMIN_MEMBER_PROFILE_VISIBILITIES))
    || !isOneOf(value.stored_account_status, ADMIN_MEMBER_ACCOUNT_STATUSES)
    || !isOneOf(value.current_account_status, ADMIN_MEMBER_ACCOUNT_STATUSES)
    || !isNullableTimestamptz(value.suspended_at)
    || !isNullableTimestamptz(value.suspended_until)
    || typeof value.premium_membership_exists !== 'boolean'
    || !(value.premium_stored_status === null
      || isOneOf(value.premium_stored_status, ADMIN_MEMBER_PREMIUM_STATUSES))
    || typeof value.premium_is_available !== 'boolean'
    || !isOneOf(value.premium_period_state, ADMIN_MEMBER_PREMIUM_PERIOD_STATES)
    || totalCount === null
  ) return null;

  if (
    value.profile_exists
      ? value.profile_status === 'missing'
        || value.profile_visibility === null
        || typeof value.nickname !== 'string'
      : value.profile_status !== 'missing'
        || value.profile_visibility !== null
        || value.nickname !== null
  ) return null;

  if (
    value.stored_account_status === 'active'
      ? value.current_account_status !== 'active'
        || value.suspended_at !== null
        || value.suspended_until !== null
      : value.suspended_at === null
        || value.current_account_status === 'active' && value.suspended_until === null
  ) return null;

  if (
    value.suspended_at !== null
    && value.suspended_until !== null
    && Date.parse(value.suspended_until) <= Date.parse(value.suspended_at)
  ) return null;

  if (
    value.premium_membership_exists
      ? value.premium_stored_status === null || value.premium_period_state === 'none'
      : value.premium_stored_status !== null
        || value.premium_is_available
        || value.premium_period_state !== 'none'
  ) return null;

  if (
    value.premium_is_available !== (value.premium_period_state === 'available')
    || value.premium_period_state === 'available' && value.premium_stored_status !== 'active'
    || value.premium_period_state === 'suspended' && value.premium_stored_status !== 'suspended'
    || value.premium_period_state === 'revoked' && value.premium_stored_status !== 'revoked'
  ) return null;

  return {
    memberUserId: value.member_user_id,
    nickname: value.nickname,
    joinedAt: value.joined_at,
    profileExists: value.profile_exists,
    profileStatus: value.profile_status,
    profileVisibility: value.profile_visibility,
    storedAccountStatus: value.stored_account_status,
    currentAccountStatus: value.current_account_status,
    suspendedAt: value.suspended_at,
    suspendedUntil: value.suspended_until,
    premiumMembershipExists: value.premium_membership_exists,
    premiumStoredStatus: value.premium_stored_status,
    premiumIsAvailable: value.premium_is_available,
    premiumPeriodState: value.premium_period_state,
    totalCount,
  };
};

export const parseAdminMemberList = (value: unknown): AdminMemberListItem[] | null => {
  if (!Array.isArray(value)) return null;
  const members: AdminMemberListItem[] = [];
  let totalCount: number | null = null;
  const memberIds = new Set<string>();

  for (const entry of value) {
    const member = parseAdminMember(entry);
    if (!member) return null;
    if (totalCount === null) totalCount = member.totalCount;
    if (member.totalCount !== totalCount || memberIds.has(member.memberUserId)) return null;
    memberIds.add(member.memberUserId);
    members.push(member);
  }

  return members;
};

export const parseAdminMemberDetail = (value: unknown): AdminMemberDetail | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];

  if (
    !isUuid(row.member_user_id)
    || !isTimestamptz(row.joined_at)
    || typeof row.profile_exists !== 'boolean'
    || !isOneOf(row.profile_status, ADMIN_MEMBER_PROFILE_STATUSES)
    || !(row.profile_visibility === null
      || isOneOf(row.profile_visibility, ADMIN_MEMBER_PROFILE_VISIBILITIES))
    || !isNullableString(row.nickname)
    || !isNullableString(row.gender)
    || !isNullableDate(row.birth_date)
    || !isNullableInteger(row.height)
    || !isNullableString(row.region)
    || !isNullableString(row.job)
    || !isNullableString(row.education)
    || !isNullableString(row.religion)
    || !isNullableString(row.hobby)
    || !isNullableString(row.drinking)
    || !isNullableString(row.smoking)
    || !isNullableString(row.marriage_history)
    || !isNullableString(row.introduction)
    || !isNullableString(row.marriage_values)
    || !isNullableString(row.profile_image)
    || !isNullableStringArray(row.profile_images)
    || !isOneOf(row.stored_account_status, ADMIN_MEMBER_ACCOUNT_STATUSES)
    || !isOneOf(row.current_account_status, ADMIN_MEMBER_ACCOUNT_STATUSES)
    || !isNullableTimestamptz(row.suspended_at)
    || !isNullableTimestamptz(row.suspended_until)
    || typeof row.premium_membership_exists !== 'boolean'
    || !(row.premium_stored_status === null
      || isOneOf(row.premium_stored_status, ADMIN_MEMBER_PREMIUM_STATUSES))
    || typeof row.premium_is_available !== 'boolean'
    || !isOneOf(row.premium_period_state, ADMIN_MEMBER_PREMIUM_PERIOD_STATES)
    || !isNullableTimestamptz(row.premium_started_at)
    || !isNullableTimestamptz(row.premium_expires_at)
  ) return null;

  const profileValues = [
    row.nickname,
    row.gender,
    row.birth_date,
    row.height,
    row.region,
    row.job,
    row.education,
    row.religion,
    row.hobby,
    row.drinking,
    row.smoking,
    row.marriage_history,
    row.introduction,
    row.marriage_values,
    row.profile_image,
    row.profile_images,
  ];
  if (
    row.profile_exists
      ? row.profile_status === 'missing'
        || row.profile_visibility === null
        || typeof row.nickname !== 'string'
        || !Array.isArray(row.profile_images)
      : row.profile_status !== 'missing'
        || row.profile_visibility !== null
        || profileValues.some((entry) => entry !== null)
  ) return null;

  if (
    row.stored_account_status === 'active'
      ? row.current_account_status !== 'active'
        || row.suspended_at !== null
        || row.suspended_until !== null
      : row.suspended_at === null
        || row.current_account_status === 'active' && row.suspended_until === null
  ) return null;
  if (
    row.suspended_at !== null
    && row.suspended_until !== null
    && Date.parse(row.suspended_until) <= Date.parse(row.suspended_at)
  ) return null;

  if (
    row.premium_membership_exists
      ? row.premium_stored_status === null
        || row.premium_period_state === 'none'
        || row.premium_started_at === null
      : row.premium_stored_status !== null
        || row.premium_is_available
        || row.premium_period_state !== 'none'
        || row.premium_started_at !== null
        || row.premium_expires_at !== null
  ) return null;
  if (
    row.premium_is_available !== (row.premium_period_state === 'available')
    || row.premium_period_state === 'available' && row.premium_stored_status !== 'active'
    || row.premium_period_state === 'suspended' && row.premium_stored_status !== 'suspended'
    || row.premium_period_state === 'revoked' && row.premium_stored_status !== 'revoked'
    || row.premium_started_at !== null
      && row.premium_expires_at !== null
      && Date.parse(row.premium_expires_at) <= Date.parse(row.premium_started_at)
  ) return null;

  return {
    memberUserId: row.member_user_id,
    joinedAt: row.joined_at,
    profileExists: row.profile_exists,
    profileStatus: row.profile_status,
    profileVisibility: row.profile_visibility,
    nickname: row.nickname,
    gender: row.gender,
    birthDate: row.birth_date,
    height: row.height,
    region: row.region,
    job: row.job,
    education: row.education,
    religion: row.religion,
    hobby: row.hobby,
    drinking: row.drinking,
    smoking: row.smoking,
    marriageHistory: row.marriage_history,
    introduction: row.introduction,
    marriageValues: row.marriage_values,
    profileImage: row.profile_image,
    profileImages: row.profile_images,
    storedAccountStatus: row.stored_account_status,
    currentAccountStatus: row.current_account_status,
    suspendedAt: row.suspended_at,
    suspendedUntil: row.suspended_until,
    premiumMembershipExists: row.premium_membership_exists,
    premiumStoredStatus: row.premium_stored_status,
    premiumIsAvailable: row.premium_is_available,
    premiumPeriodState: row.premium_period_state,
    premiumStartedAt: row.premium_started_at,
    premiumExpiresAt: row.premium_expires_at,
  };
};

export const getAdminMemberProfileStatusClassName = (
  status: AdminMemberProfileStatus,
): string => {
  if (status === 'completed') return 'bg-green-100 text-green-800';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-600';
};

export const getAdminMemberAccountStatusClassName = (
  status: AdminMemberAccountStatus,
): string => (
  status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
);

export const getAdminMemberPremiumPeriodStateClassName = (
  status: AdminMemberPremiumPeriodState,
): string => {
  if (status === 'available') return 'bg-green-100 text-green-800';
  if (status === 'not_started') return 'bg-blue-100 text-blue-800';
  if (status === 'suspended') return 'bg-amber-100 text-amber-800';
  if (status === 'revoked' || status === 'expired') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};
