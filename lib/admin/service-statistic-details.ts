export const ADMIN_SERVICE_STATISTIC_METRICS = [
  'total_matches',
  'active_matches',
  'ended_matches',
  'total_messages',
  'recent_members',
  'recent_reports',
] as const;

export type AdminServiceStatisticMetric = (
  typeof ADMIN_SERVICE_STATISTIC_METRICS
)[number];

export const ADMIN_SERVICE_STATISTIC_LABELS: Record<AdminServiceStatisticMetric, string> = {
  total_matches: '전체 매칭',
  active_matches: '진행 중 매칭',
  ended_matches: '종료 매칭',
  total_messages: '전체 메시지',
  recent_members: '최근 7일 신규 회원',
  recent_reports: '최근 7일 신고',
};

export type AdminServiceStatisticUser = {
  userId: string;
  nickname: string | null;
  memberExists: boolean;
  profileExists: boolean;
};

export type AdminServiceMatchDetail = {
  kind: 'match';
  itemId: string;
  createdAt: string;
  matchedAt: string;
  endedAt: string | null;
  status: 'active' | 'ended';
  firstUser: AdminServiceStatisticUser;
  secondUser: AdminServiceStatisticUser;
  totalCount: number;
};

export type AdminServiceMessageDetail = {
  kind: 'message';
  itemId: string;
  createdAt: string;
  matchId: string;
  sender: AdminServiceStatisticUser;
  moderationVisibility: 'visible' | 'hidden';
  totalCount: number;
};

export type AdminServiceMemberDetail = {
  kind: 'member';
  itemId: string;
  joinedAt: string;
  nickname: string | null;
  profileExists: boolean;
  profileStatus: 'missing' | 'in_progress' | 'completed';
  profileVisibility: 'visible' | 'hidden' | null;
  accountStatus: 'active' | 'suspended';
  premiumStatus: 'none' | 'not_started' | 'expired' | 'suspended' | 'revoked' | 'available';
  totalCount: number;
};

export type AdminServiceReportDetail = {
  kind: 'report';
  itemId: string;
  createdAt: string;
  targetType: 'profile' | 'message';
  reason: 'inappropriate_content' | 'harassment' | 'fake_profile' | 'spam' | 'privacy_violation' | 'other';
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reporter: AdminServiceStatisticUser;
  target: AdminServiceStatisticUser;
  totalCount: number;
};

export type AdminServiceStatisticDetail =
  | AdminServiceMatchDetail
  | AdminServiceMessageDetail
  | AdminServiceMemberDetail
  | AdminServiceReportDetail;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

const isDate = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const isNullableDate = (value: unknown): value is string | null => (
  value === null || isDate(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
};

export const isAdminServiceStatisticMetric = (
  value: unknown,
): value is AdminServiceStatisticMetric => (
  typeof value === 'string'
  && ADMIN_SERVICE_STATISTIC_METRICS.includes(value as AdminServiceStatisticMetric)
);

export const normalizeAdminServiceStatisticPage = (
  value: unknown,
  pageSize: number,
): number => {
  if (
    typeof value !== 'string'
    || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(pageSize)
    || pageSize < 1
  ) return 1;

  const page = Number(value);
  const maxPage = Math.floor(2_147_483_647 / pageSize) + 1;
  return Number.isSafeInteger(page) && page <= maxPage ? page : 1;
};

const parseUser = (
  row: Record<string, unknown>,
  prefix: 'primary' | 'secondary',
): AdminServiceStatisticUser | null => {
  const userId = row[`${prefix}_user_id`];
  const nickname = row[`${prefix}_nickname`];
  const memberExists = row[`${prefix}_member_exists`];
  const profileExists = row[`${prefix}_profile_exists`];
  if (
    !isUuid(userId)
    || !isNullableString(nickname)
    || typeof memberExists !== 'boolean'
    || typeof profileExists !== 'boolean'
  ) return null;
  return { userId, nickname, memberExists, profileExists };
};

export const parseAdminServiceStatisticDetails = (
  value: unknown,
  expectedMetric: AdminServiceStatisticMetric,
): AdminServiceStatisticDetail[] | null => {
  if (!Array.isArray(value)) return null;
  const details: AdminServiceStatisticDetail[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || entry.metric !== expectedMetric || !isUuid(entry.item_id)) return null;
    const totalCount = parseCount(entry.total_count);
    if (totalCount === null) return null;

    if (expectedMetric === 'total_matches' || expectedMetric === 'active_matches' || expectedMetric === 'ended_matches') {
      const firstUser = parseUser(entry, 'primary');
      const secondUser = parseUser(entry, 'secondary');
      if (
        !isDate(entry.item_created_at)
        || !isDate(entry.matched_at)
        || !isNullableDate(entry.ended_at)
        || (entry.match_status !== 'active' && entry.match_status !== 'ended')
        || !firstUser
        || !secondUser
        || entry.match_status === 'active' && entry.ended_at !== null
        || entry.match_status === 'ended' && entry.ended_at === null
        || expectedMetric === 'active_matches' && entry.match_status !== 'active'
        || expectedMetric === 'ended_matches' && entry.match_status !== 'ended'
      ) return null;
      details.push({
        kind: 'match', itemId: entry.item_id, createdAt: entry.item_created_at,
        matchedAt: entry.matched_at, endedAt: entry.ended_at, status: entry.match_status,
        firstUser, secondUser, totalCount,
      });
      continue;
    }

    if (expectedMetric === 'total_messages') {
      const sender = parseUser(entry, 'primary');
      if (
        !isDate(entry.item_created_at)
        || !isUuid(entry.match_id)
        || !sender
        || (entry.message_moderation_visibility !== 'visible'
          && entry.message_moderation_visibility !== 'hidden')
      ) return null;
      details.push({
        kind: 'message', itemId: entry.item_id, createdAt: entry.item_created_at,
        matchId: entry.match_id, sender,
        moderationVisibility: entry.message_moderation_visibility, totalCount,
      });
      continue;
    }

    if (expectedMetric === 'recent_members') {
      const member = parseUser(entry, 'primary');
      if (
        !isDate(entry.item_created_at)
        || !member
        || member.userId !== entry.item_id
        || !member.memberExists
        || !['missing', 'in_progress', 'completed'].includes(String(entry.member_profile_status))
        || !['visible', 'hidden', null].includes(entry.member_profile_visibility as string | null)
        || !['active', 'suspended'].includes(String(entry.member_account_status))
        || !['none', 'not_started', 'expired', 'suspended', 'revoked', 'available'].includes(String(entry.member_premium_status))
      ) return null;
      details.push({
        kind: 'member', itemId: entry.item_id, joinedAt: entry.item_created_at,
        nickname: member.nickname, profileExists: member.profileExists,
        profileStatus: entry.member_profile_status as AdminServiceMemberDetail['profileStatus'],
        profileVisibility: entry.member_profile_visibility as AdminServiceMemberDetail['profileVisibility'],
        accountStatus: entry.member_account_status as AdminServiceMemberDetail['accountStatus'],
        premiumStatus: entry.member_premium_status as AdminServiceMemberDetail['premiumStatus'],
        totalCount,
      });
      continue;
    }

    const reporter = parseUser(entry, 'primary');
    const target = parseUser(entry, 'secondary');
    if (
      !isDate(entry.item_created_at)
      || !['profile', 'message'].includes(String(entry.report_target_type))
      || !['inappropriate_content', 'harassment', 'fake_profile', 'spam', 'privacy_violation', 'other'].includes(String(entry.report_reason))
      || !['pending', 'reviewing', 'resolved', 'dismissed'].includes(String(entry.report_status))
      || !reporter
      || !target
    ) return null;
    details.push({
      kind: 'report', itemId: entry.item_id, createdAt: entry.item_created_at,
      targetType: entry.report_target_type as AdminServiceReportDetail['targetType'],
      reason: entry.report_reason as AdminServiceReportDetail['reason'],
      status: entry.report_status as AdminServiceReportDetail['status'],
      reporter, target, totalCount,
    });
  }

  return details;
};
