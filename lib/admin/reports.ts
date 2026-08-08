export const REPORT_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'] as const;
export const REPORT_TARGET_TYPES = ['profile', 'message'] as const;
export const REPORT_REASONS = [
  'inappropriate_content',
  'harassment',
  'fake_profile',
  'spam',
  'privacy_violation',
  'other',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

export type AdminReportListItem = {
  reportId: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  reporterUserId: string;
  reportedUserId: string;
  messageId: string | null;
  reporterNickname: string | null;
  reportedNickname: string | null;
  reporterMemberExists: boolean;
  reporterProfileExists: boolean;
  reportedMemberExists: boolean;
  reportedProfileExists: boolean;
  totalCount: number;
};

export type AdminReportDetail = {
  reportId: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reporterUserId: string;
  reportedUserId: string;
  messageId: string | null;
  reporter: AdminReportProfile;
  reported: AdminReportProfile & { marriageHistory: string | null };
  message: {
    content: string | null;
    senderId: string | null;
    senderNickname: string | null;
    senderMemberExists: boolean;
    senderProfileExists: boolean;
    createdAt: string | null;
    matchId: string | null;
    matchUser1Id: string | null;
    matchUser1Nickname: string | null;
    matchUser2Id: string | null;
    matchUser2Nickname: string | null;
    exists: boolean;
  };
};

export type AdminReportProfile = {
  nickname: string | null;
  gender: string | null;
  birthDate: string | null;
  region: string | null;
  job: string | null;
  profileImage: string | null;
  memberExists: boolean;
  profileExists: boolean;
};

export type AdminReportAction = {
  actionId: string;
  previousStatus: ReportStatus;
  newStatus: ReportStatus;
  note: string | null;
  createdAt: string;
  adminUserId: string | null;
  adminRole: string | null;
};

export type ReportStatusActionState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '접수 대기',
  reviewing: '검토 중',
  resolved: '처리 완료',
  dismissed: '기각',
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  profile: '회원 프로필',
  message: '채팅 메시지',
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate_content: '부적절한 내용',
  harassment: '괴롭힘·모욕',
  fake_profile: '허위 프로필',
  spam: '광고·스팸',
  privacy_violation: '개인정보 침해',
  other: '기타',
};

export const REPORT_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  pending: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: ['reviewing'],
  dismissed: ['reviewing'],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableDateOnly = (value: unknown): value is string | null => (
  value === null
  || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
);

const isNullableUuid = (value: unknown): value is string | null => (
  value === null || isUuid(value)
);

const isValidDate = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const count = Number(value);
    return Number.isSafeInteger(count) ? count : null;
  }
  return null;
};

export const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

export const isReportStatus = (value: unknown): value is ReportStatus => (
  typeof value === 'string' && REPORT_STATUSES.includes(value as ReportStatus)
);

export const isReportTargetType = (value: unknown): value is ReportTargetType => (
  typeof value === 'string' && REPORT_TARGET_TYPES.includes(value as ReportTargetType)
);

export const isReportReason = (value: unknown): value is ReportReason => (
  typeof value === 'string' && REPORT_REASONS.includes(value as ReportReason)
);

export const parseAdminReportList = (value: unknown): AdminReportListItem[] | null => {
  if (!Array.isArray(value)) return null;
  const reports: AdminReportListItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const totalCount = parseCount(entry.total_count);
    if (
      !isUuid(entry.report_id)
      || !isReportTargetType(entry.target_type)
      || !isReportReason(entry.reason)
      || !isReportStatus(entry.status)
      || !isValidDate(entry.created_at)
      || !isUuid(entry.reporter_user_id)
      || !isUuid(entry.reported_user_id)
      || !isNullableUuid(entry.message_id)
      || !isNullableString(entry.reporter_nickname)
      || !isNullableString(entry.reported_nickname)
      || typeof entry.reporter_member_exists !== 'boolean'
      || typeof entry.reporter_profile_exists !== 'boolean'
      || typeof entry.reported_member_exists !== 'boolean'
      || typeof entry.reported_profile_exists !== 'boolean'
      || totalCount === null
    ) return null;

    reports.push({
      reportId: entry.report_id,
      targetType: entry.target_type,
      reason: entry.reason,
      status: entry.status,
      createdAt: entry.created_at,
      reporterUserId: entry.reporter_user_id,
      reportedUserId: entry.reported_user_id,
      messageId: entry.message_id,
      reporterNickname: entry.reporter_nickname,
      reportedNickname: entry.reported_nickname,
      reporterMemberExists: entry.reporter_member_exists,
      reporterProfileExists: entry.reporter_profile_exists,
      reportedMemberExists: entry.reported_member_exists,
      reportedProfileExists: entry.reported_profile_exists,
      totalCount,
    });
  }

  return reports;
};

export const parseAdminReportDetail = (value: unknown): AdminReportDetail | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const messageSenderNickname = typeof row.message_sender_nickname === 'string'
    ? row.message_sender_nickname
    : null;
  const matchUser1Id = isUuid(row.match_user_1_id) ? row.match_user_1_id : null;
  const matchUser1Nickname = typeof row.match_user_1_nickname === 'string'
    ? row.match_user_1_nickname
    : null;
  const matchUser2Id = isUuid(row.match_user_2_id) ? row.match_user_2_id : null;
  const matchUser2Nickname = typeof row.match_user_2_nickname === 'string'
    ? row.match_user_2_nickname
    : null;
  if (
    !isUuid(row.report_id)
    || !isReportTargetType(row.target_type)
    || !isReportReason(row.reason)
    || !isNullableString(row.details)
    || !isReportStatus(row.status)
    || !isValidDate(row.created_at)
    || !isUuid(row.reporter_user_id)
    || !isUuid(row.reported_user_id)
    || !isNullableUuid(row.message_id)
    || !isNullableString(row.reporter_nickname)
    || !isNullableString(row.reporter_gender)
    || !isNullableDateOnly(row.reporter_birth_date)
    || !isNullableString(row.reporter_region)
    || !isNullableString(row.reporter_job)
    || !isNullableString(row.reporter_profile_image)
    || typeof row.reporter_profile_exists !== 'boolean'
    || typeof row.reporter_member_exists !== 'boolean'
    || !isNullableString(row.reported_nickname)
    || !isNullableString(row.reported_gender)
    || !isNullableDateOnly(row.reported_birth_date)
    || !isNullableString(row.reported_region)
    || !isNullableString(row.reported_job)
    || !isNullableString(row.reported_profile_image)
    || !isNullableString(row.reported_marriage_history)
    || typeof row.reported_profile_exists !== 'boolean'
    || typeof row.reported_member_exists !== 'boolean'
    || !isNullableString(row.message_content)
    || !isNullableUuid(row.message_sender_id)
    || typeof row.message_sender_member_exists !== 'boolean'
    || typeof row.message_sender_profile_exists !== 'boolean'
    || (row.message_created_at !== null && !isValidDate(row.message_created_at))
    || !isNullableUuid(row.match_id)
    || typeof row.message_exists !== 'boolean'
  ) return null;

  return {
    reportId: row.report_id,
    targetType: row.target_type,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reporterUserId: row.reporter_user_id,
    reportedUserId: row.reported_user_id,
    messageId: row.message_id,
    reporter: {
      nickname: row.reporter_nickname,
      gender: row.reporter_gender,
      birthDate: row.reporter_birth_date,
      region: row.reporter_region,
      job: row.reporter_job,
      profileImage: row.reporter_profile_image,
      memberExists: row.reporter_member_exists,
      profileExists: row.reporter_profile_exists,
    },
    reported: {
      nickname: row.reported_nickname,
      gender: row.reported_gender,
      birthDate: row.reported_birth_date,
      region: row.reported_region,
      job: row.reported_job,
      profileImage: row.reported_profile_image,
      marriageHistory: row.reported_marriage_history,
      memberExists: row.reported_member_exists,
      profileExists: row.reported_profile_exists,
    },
    message: {
      content: row.message_content,
      senderId: row.message_sender_id,
      senderNickname: messageSenderNickname,
      senderMemberExists: row.message_sender_member_exists,
      senderProfileExists: row.message_sender_profile_exists,
      createdAt: row.message_created_at,
      matchId: row.match_id,
      matchUser1Id,
      matchUser1Nickname,
      matchUser2Id,
      matchUser2Nickname,
      exists: row.message_exists,
    },
  };
};

export const parseAdminReportActions = (value: unknown): AdminReportAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: AdminReportAction[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.action_id)
      || !isReportStatus(entry.previous_status)
      || !isReportStatus(entry.new_status)
      || !isNullableString(entry.note)
      || !isValidDate(entry.created_at)
      || !isNullableUuid(entry.admin_user_id)
      || !isNullableString(entry.admin_role)
    ) return null;

    actions.push({
      actionId: entry.action_id,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      note: entry.note,
      createdAt: entry.created_at,
      adminUserId: entry.admin_user_id,
      adminRole: entry.admin_role,
    });
  }
  return actions;
};

export const parseStatusUpdateResult = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return false;
  const row = value[0];
  return isUuid(row.report_id)
    && isReportStatus(row.previous_status)
    && isReportStatus(row.new_status)
    && isNullableString(row.note)
    && isValidDate(row.changed_at);
};

export const getReportStatusClassName = (status: ReportStatus): string => {
  if (status === 'pending') return 'bg-amber-100 text-amber-800';
  if (status === 'reviewing') return 'bg-blue-100 text-blue-800';
  if (status === 'resolved') return 'bg-green-100 text-green-800';
  return 'bg-gray-200 text-gray-700';
};
