export const PREMIUM_MEMBERSHIP_FILTERS = [
  'all',
  'exists',
  'available',
  'not_started',
  'expired',
  'suspended',
  'revoked',
] as const;

export const PREMIUM_MEMBERSHIP_STATUSES = [
  'active',
  'suspended',
  'revoked',
] as const;

export const PREMIUM_MEMBERSHIP_SORT_KEYS = [
  'updated_at',
  'nickname',
  'started_at',
  'expires_at',
] as const;

export const PREMIUM_MEMBERSHIP_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export const PREMIUM_FEATURE_KEYS = [
  'likes_received',
  'received_likes',
  'advanced_member_search',
  'expanded_recommendations',
  'priority_recommendation',
] as const;

export const PREMIUM_MEMBERSHIP_ACTION_TYPES = [
  'granted',
  'updated',
  'suspended',
  'reactivated',
  'revoked',
  'regranted',
] as const;

export const MEMBER_ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export const MEMBER_PROFILE_VISIBILITIES = ['visible', 'hidden'] as const;

export type PremiumMembershipFilter = (typeof PREMIUM_MEMBERSHIP_FILTERS)[number];
export type PremiumMembershipStatus = (typeof PREMIUM_MEMBERSHIP_STATUSES)[number];
export type PremiumMembershipSortKey = (typeof PREMIUM_MEMBERSHIP_SORT_KEYS)[number];
export type PremiumMembershipSortDirection = (typeof PREMIUM_MEMBERSHIP_SORT_DIRECTIONS)[number];
export type PremiumFeatureKey = (typeof PREMIUM_FEATURE_KEYS)[number];
export type PremiumMembershipActionType = (typeof PREMIUM_MEMBERSHIP_ACTION_TYPES)[number];
export type MemberAccountStatus = (typeof MEMBER_ACCOUNT_STATUSES)[number];
export type MemberProfileVisibility = (typeof MEMBER_PROFILE_VISIBILITIES)[number];

export type AdminPremiumMembershipListItem = {
  memberUserId: string;
  profileExists: boolean;
  nickname: string | null;
  membershipExists: boolean;
  membershipId: string | null;
  storedStatus: PremiumMembershipStatus | null;
  isAvailable: boolean;
  isNotStarted: boolean;
  isExpired: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  featureKeys: PremiumFeatureKey[];
  membershipUpdatedAt: string | null;
  accountStatus: MemberAccountStatus;
  profileVisibility: MemberProfileVisibility;
  totalCount: number;
};

export type AdminPremiumMembershipAction = {
  actionId: string;
  requestId: string;
  actionType: PremiumMembershipActionType;
  previousStatus: PremiumMembershipStatus | null;
  newStatus: PremiumMembershipStatus;
  previousStartedAt: string | null;
  newStartedAt: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  previousFeatureKeys: PremiumFeatureKey[] | null;
  newFeatureKeys: PremiumFeatureKey[];
  reason: string;
  performedBy: string;
  membershipUpdatedAt: string;
  createdAt: string;
};

export type AdminPremiumMembershipDetail = {
  subjectUserId: string;
  profileExists: boolean;
  nickname: string | null;
  membershipExists: boolean;
  membershipId: string | null;
  storedStatus: PremiumMembershipStatus | null;
  isAvailable: boolean;
  isNotStarted: boolean;
  isExpired: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  featureKeys: PremiumFeatureKey[];
  membershipUpdatedAt: string | null;
  accountStatus: MemberAccountStatus;
  profileVisibility: MemberProfileVisibility;
  recentActions: AdminPremiumMembershipAction[];
};

export type PremiumMembershipUpdateResult = {
  isSuccess: true;
  isNoop: boolean;
  isDuplicateRequest: boolean;
  membershipId: string;
  subjectUserId: string;
  storedStatus: PremiumMembershipStatus;
  isAvailable: boolean;
  startedAt: string;
  expiresAt: string | null;
  featureKeys: PremiumFeatureKey[];
  membershipUpdatedAt: string;
  actionId: string | null;
  actionType: PremiumMembershipActionType | null;
};

export type PremiumMembershipUpdateActionState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
  requestId?: string;
  resultType?: 'changed' | 'noop' | 'duplicate';
  requestIdConflict?: boolean;
};

export type PremiumPeriodState =
  | 'none'
  | 'not_started'
  | 'expired'
  | 'suspended'
  | 'revoked'
  | 'available'
  | 'unavailable';

export const PREMIUM_FEATURE_LABELS: Record<PremiumFeatureKey, string> = {
  likes_received: '받은 관심 회원',
  received_likes: '나에게 좋아요를 보낸 회원',
  advanced_member_search: '고급 회원 검색',
  expanded_recommendations: '추천 인원 확대',
  priority_recommendation: '우선 추천 노출',
};

export const PREMIUM_FEATURE_DESCRIPTIONS: Partial<Record<PremiumFeatureKey, string>> = {
  priority_recommendation: 'AI Match에서 추천 점수가 같은 후보 중 우선적으로 노출될 수 있습니다.',
};

export const PREMIUM_MEMBERSHIP_ACTION_LABELS: Record<PremiumMembershipActionType, string> = {
  granted: '신규 부여',
  updated: '정보 변경',
  suspended: 'Premium 정지',
  reactivated: '재활성화',
  revoked: '회수',
  regranted: '재부여',
};

export const PREMIUM_STATUS_LABELS: Record<PremiumMembershipStatus | 'none', string> = {
  active: '활성',
  suspended: '정지',
  revoked: '회수',
  none: '미보유',
};

export const PREMIUM_PERIOD_STATE_LABELS: Record<PremiumPeriodState, string> = {
  none: 'Premium 미보유',
  not_started: '시작 전',
  expired: '만료',
  suspended: '저장 상태 정지',
  revoked: '저장 상태 회수',
  available: '이용 가능',
  unavailable: '이용 불가',
};

export const MEMBER_ACCOUNT_STATUS_LABELS: Record<MemberAccountStatus, string> = {
  active: '정상',
  suspended: '정지',
};

export const MEMBER_PROFILE_VISIBILITY_LABELS: Record<MemberProfileVisibility, string> = {
  visible: '노출',
  hidden: '숨김',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

const isNullableUuid = (value: unknown): value is string | null => (
  value === null || isUuid(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

export const isTimestamptzString = (value: unknown): value is string => (
  typeof value === 'string'
  && TIMESTAMPTZ_PATTERN.test(value)
  && !Number.isNaN(Date.parse(value))
);

const isNullableDateString = (value: unknown): value is string | null => (
  value === null || isDateString(value)
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const count = Number(value);
    return Number.isSafeInteger(count) ? count : null;
  }
  return null;
};

export const isPremiumMembershipFilter = (
  value: unknown,
): value is PremiumMembershipFilter => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_FILTERS.includes(value as PremiumMembershipFilter)
);

export const isPremiumMembershipStatus = (
  value: unknown,
): value is PremiumMembershipStatus => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_STATUSES.includes(value as PremiumMembershipStatus)
);

export const isPremiumMembershipSortKey = (
  value: unknown,
): value is PremiumMembershipSortKey => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_SORT_KEYS.includes(value as PremiumMembershipSortKey)
);

export const isPremiumMembershipSortDirection = (
  value: unknown,
): value is PremiumMembershipSortDirection => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_SORT_DIRECTIONS.includes(value as PremiumMembershipSortDirection)
);

export const isPremiumFeatureKey = (value: unknown): value is PremiumFeatureKey => (
  typeof value === 'string'
  && PREMIUM_FEATURE_KEYS.includes(value as PremiumFeatureKey)
);

const isPremiumMembershipActionType = (
  value: unknown,
): value is PremiumMembershipActionType => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_ACTION_TYPES.includes(value as PremiumMembershipActionType)
);

const isMemberAccountStatus = (value: unknown): value is MemberAccountStatus => (
  typeof value === 'string'
  && MEMBER_ACCOUNT_STATUSES.includes(value as MemberAccountStatus)
);

const isMemberProfileVisibility = (
  value: unknown,
): value is MemberProfileVisibility => (
  typeof value === 'string'
  && MEMBER_PROFILE_VISIBILITIES.includes(value as MemberProfileVisibility)
);

const parseFeatureKeys = (value: unknown): PremiumFeatureKey[] | null => {
  if (!Array.isArray(value)) return null;
  const featureKeys: PremiumFeatureKey[] = [];
  for (const featureKey of value) {
    if (!isPremiumFeatureKey(featureKey)) return null;
    featureKeys.push(featureKey);
  }
  return new Set(featureKeys).size === featureKeys.length ? featureKeys : null;
};

export const parsePremiumMembershipUpdateResult = (
  value: unknown,
  expectedSubjectUserId: string,
): PremiumMembershipUpdateResult | null => {
  if (
    !isUuid(expectedSubjectUserId)
    || !Array.isArray(value)
    || value.length !== 1
    || !isRecord(value[0])
  ) return null;

  const entry = value[0];
  const featureKeys = parseFeatureKeys(entry.feature_keys);
  const actionId = entry.action_id === null
    ? null
    : isUuid(entry.action_id) ? entry.action_id : undefined;
  const actionType = entry.action_type === null
    ? null
    : isPremiumMembershipActionType(entry.action_type) ? entry.action_type : undefined;
  if (
    entry.is_success !== true
    || typeof entry.is_noop !== 'boolean'
    || typeof entry.is_duplicate_request !== 'boolean'
    || !isUuid(entry.membership_id)
    || !isUuid(entry.subject_user_id)
    || entry.subject_user_id.toLowerCase() !== expectedSubjectUserId.toLowerCase()
    || !isPremiumMembershipStatus(entry.stored_status)
    || typeof entry.is_available !== 'boolean'
    || !isTimestamptzString(entry.started_at)
    || !(entry.expires_at === null || isTimestamptzString(entry.expires_at))
    || featureKeys === null
    || featureKeys.length < 1
    || featureKeys.length > PREMIUM_FEATURE_KEYS.length
    || !isTimestamptzString(entry.membership_updated_at)
    || actionId === undefined
    || actionType === undefined
  ) return null;

  if (
    entry.is_noop
      ? actionId !== null || actionType !== null
      : actionId === null || actionType === null
  ) return null;

  return {
    isSuccess: true,
    isNoop: entry.is_noop,
    isDuplicateRequest: entry.is_duplicate_request,
    membershipId: entry.membership_id,
    subjectUserId: entry.subject_user_id,
    storedStatus: entry.stored_status,
    isAvailable: entry.is_available,
    startedAt: entry.started_at,
    expiresAt: entry.expires_at,
    featureKeys,
    membershipUpdatedAt: entry.membership_updated_at,
    actionId,
    actionType,
  };
};

const parsePremiumMembershipActions = (
  value: unknown,
): AdminPremiumMembershipAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: AdminPremiumMembershipAction[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const previousFeatureKeys = entry.previous_feature_keys === null
      ? null
      : parseFeatureKeys(entry.previous_feature_keys);
    const newFeatureKeys = parseFeatureKeys(entry.new_feature_keys);
    if (
      !isUuid(entry.id)
      || !isUuid(entry.request_id)
      || !isPremiumMembershipActionType(entry.action_type)
      || !(entry.previous_status === null || isPremiumMembershipStatus(entry.previous_status))
      || !isPremiumMembershipStatus(entry.new_status)
      || !isNullableDateString(entry.previous_started_at)
      || !isDateString(entry.new_started_at)
      || !isNullableDateString(entry.previous_expires_at)
      || !isNullableDateString(entry.new_expires_at)
      || previousFeatureKeys === null && entry.previous_feature_keys !== null
      || newFeatureKeys === null
      || newFeatureKeys.length < 1
      || newFeatureKeys.length > PREMIUM_FEATURE_KEYS.length
      || typeof entry.reason !== 'string'
      || entry.reason.trim() !== entry.reason
      || entry.reason.length < 1
      || entry.reason.length > 500
      || !isUuid(entry.performed_by)
      || !isDateString(entry.membership_updated_at)
      || !isDateString(entry.created_at)
    ) return null;

    if (
      entry.action_type === 'granted'
        ? entry.previous_status !== null
          || entry.previous_started_at !== null
          || entry.previous_expires_at !== null
          || previousFeatureKeys !== null
        : !isPremiumMembershipStatus(entry.previous_status)
          || !isDateString(entry.previous_started_at)
          || previousFeatureKeys === null
          || previousFeatureKeys.length < 1
          || previousFeatureKeys.length > PREMIUM_FEATURE_KEYS.length
    ) return null;

    actions.push({
      actionId: entry.id,
      requestId: entry.request_id,
      actionType: entry.action_type,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      previousStartedAt: entry.previous_started_at,
      newStartedAt: entry.new_started_at,
      previousExpiresAt: entry.previous_expires_at,
      newExpiresAt: entry.new_expires_at,
      previousFeatureKeys,
      newFeatureKeys,
      reason: entry.reason,
      performedBy: entry.performed_by,
      membershipUpdatedAt: entry.membership_updated_at,
      createdAt: entry.created_at,
    });
  }

  return actions;
};

export const parseAdminPremiumMembershipDetail = (
  value: unknown,
): AdminPremiumMembershipDetail | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const entry = value[0];
  const featureKeys = parseFeatureKeys(entry.feature_keys);
  const recentActions = parsePremiumMembershipActions(entry.recent_actions);
  if (
    !isUuid(entry.subject_user_id)
    || typeof entry.profile_exists !== 'boolean'
    || !isNullableString(entry.nickname)
    || typeof entry.membership_exists !== 'boolean'
    || !isNullableUuid(entry.membership_id)
    || !(entry.stored_status === null || isPremiumMembershipStatus(entry.stored_status))
    || typeof entry.is_available !== 'boolean'
    || typeof entry.is_not_started !== 'boolean'
    || typeof entry.is_expired !== 'boolean'
    || !isNullableDateString(entry.started_at)
    || !isNullableDateString(entry.expires_at)
    || featureKeys === null
    || !isNullableDateString(entry.membership_updated_at)
    || !isMemberAccountStatus(entry.account_status)
    || !isMemberProfileVisibility(entry.profile_visibility)
    || recentActions === null
  ) return null;

  if (
    entry.membership_exists
      ? !isUuid(entry.membership_id)
        || !isPremiumMembershipStatus(entry.stored_status)
        || !isDateString(entry.started_at)
        || featureKeys.length < 1
        || featureKeys.length > PREMIUM_FEATURE_KEYS.length
        || !isDateString(entry.membership_updated_at)
      : entry.membership_id !== null
        || entry.stored_status !== null
        || entry.started_at !== null
        || entry.expires_at !== null
        || featureKeys.length !== 0
        || entry.membership_updated_at !== null
        || entry.is_available
        || entry.is_not_started
        || entry.is_expired
  ) return null;

  return {
    subjectUserId: entry.subject_user_id,
    profileExists: entry.profile_exists,
    nickname: entry.nickname,
    membershipExists: entry.membership_exists,
    membershipId: entry.membership_id,
    storedStatus: entry.stored_status,
    isAvailable: entry.is_available,
    isNotStarted: entry.is_not_started,
    isExpired: entry.is_expired,
    startedAt: entry.started_at,
    expiresAt: entry.expires_at,
    featureKeys,
    membershipUpdatedAt: entry.membership_updated_at,
    accountStatus: entry.account_status,
    profileVisibility: entry.profile_visibility,
    recentActions,
  };
};

export const parseAdminPremiumMembershipList = (
  value: unknown,
): AdminPremiumMembershipListItem[] | null => {
  if (!Array.isArray(value)) return null;
  const memberships: AdminPremiumMembershipListItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const totalCount = parseCount(entry.total_count);
    const featureKeys = parseFeatureKeys(entry.feature_keys);
    if (
      !isUuid(entry.member_user_id)
      || typeof entry.profile_exists !== 'boolean'
      || !isNullableString(entry.nickname)
      || typeof entry.membership_exists !== 'boolean'
      || !isNullableUuid(entry.membership_id)
      || !(entry.stored_status === null || isPremiumMembershipStatus(entry.stored_status))
      || typeof entry.is_available !== 'boolean'
      || typeof entry.is_not_started !== 'boolean'
      || typeof entry.is_expired !== 'boolean'
      || !isNullableDateString(entry.started_at)
      || !isNullableDateString(entry.expires_at)
      || featureKeys === null
      || !isNullableDateString(entry.membership_updated_at)
      || !isMemberAccountStatus(entry.account_status)
      || !isMemberProfileVisibility(entry.profile_visibility)
      || totalCount === null
    ) return null;

    if (
      entry.membership_exists
        ? !isUuid(entry.membership_id)
          || !isPremiumMembershipStatus(entry.stored_status)
          || !isDateString(entry.started_at)
          || featureKeys.length < 1
          || featureKeys.length > PREMIUM_FEATURE_KEYS.length
          || !isDateString(entry.membership_updated_at)
        : entry.membership_id !== null
          || entry.stored_status !== null
          || entry.started_at !== null
          || entry.expires_at !== null
          || featureKeys.length !== 0
          || entry.membership_updated_at !== null
          || entry.is_available
          || entry.is_not_started
          || entry.is_expired
    ) return null;

    memberships.push({
      memberUserId: entry.member_user_id,
      profileExists: entry.profile_exists,
      nickname: entry.nickname,
      membershipExists: entry.membership_exists,
      membershipId: entry.membership_id,
      storedStatus: entry.stored_status,
      isAvailable: entry.is_available,
      isNotStarted: entry.is_not_started,
      isExpired: entry.is_expired,
      startedAt: entry.started_at,
      expiresAt: entry.expires_at,
      featureKeys,
      membershipUpdatedAt: entry.membership_updated_at,
      accountStatus: entry.account_status,
      profileVisibility: entry.profile_visibility,
      totalCount,
    });
  }

  return memberships;
};

const SEOUL_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;
const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatDateTimeLocalFromUtcParts = (date: Date): string => {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

export const parseSeoulDateTimeLocal = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (
    year < 1000
    || month < 1
    || month > 12
    || day < 1
    || day > 31
    || hour > 23
    || minute > 59
  ) return null;

  const timestamp = Date.UTC(year, month - 1, day, hour, minute)
    - SEOUL_OFFSET_MILLISECONDS;
  const seoulDate = new Date(timestamp + SEOUL_OFFSET_MILLISECONDS);
  if (formatDateTimeLocalFromUtcParts(seoulDate) !== value) return null;
  return new Date(timestamp).toISOString();
};

export const toSeoulDateTimeLocal = (value: string | null): string => {
  if (!isDateString(value)) return '';
  const timestamp = Date.parse(value);
  return formatDateTimeLocalFromUtcParts(new Date(timestamp + SEOUL_OFFSET_MILLISECONDS));
};

export const getPremiumPeriodState = (
  membership: Pick<
    AdminPremiumMembershipListItem,
    'membershipExists' | 'isNotStarted' | 'isExpired' | 'storedStatus' | 'isAvailable'
  >,
): PremiumPeriodState => {
  if (!membership.membershipExists) return 'none';
  if (membership.isNotStarted) return 'not_started';
  if (membership.isExpired) return 'expired';
  if (membership.storedStatus === 'suspended') return 'suspended';
  if (membership.storedStatus === 'revoked') return 'revoked';
  return membership.isAvailable ? 'available' : 'unavailable';
};

export const getPremiumStatusClassName = (
  status: PremiumMembershipStatus | 'none',
): string => {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'suspended') return 'bg-amber-100 text-amber-800';
  if (status === 'revoked') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
};

export const getPremiumPeriodStateClassName = (state: PremiumPeriodState): string => {
  if (state === 'available') return 'bg-green-100 text-green-800';
  if (state === 'not_started') return 'bg-blue-100 text-blue-800';
  if (state === 'expired' || state === 'revoked') return 'bg-gray-200 text-gray-700';
  if (state === 'suspended') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-600';
};
