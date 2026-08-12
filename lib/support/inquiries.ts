export const SUPPORT_INQUIRY_CATEGORIES = ['account', 'matching', 'premium', 'report', 'service', 'other'] as const;
export const SUPPORT_INQUIRY_STATUSES = ['pending', 'answered', 'closed'] as const;

export type SupportInquiryCategory = (typeof SUPPORT_INQUIRY_CATEGORIES)[number];
export type SupportInquiryStatus = (typeof SUPPORT_INQUIRY_STATUSES)[number];

export const SUPPORT_INQUIRY_CATEGORY_LABELS: Record<SupportInquiryCategory, string> = {
  account: '계정',
  matching: '매칭·채팅',
  premium: 'Premium',
  report: '신고·안전',
  service: '서비스 이용',
  other: '기타',
};

export const SUPPORT_INQUIRY_STATUS_LABELS: Record<SupportInquiryStatus, string> = {
  pending: '답변 대기',
  answered: '답변 완료',
  closed: '종결',
};

export const getSupportInquiryStatusClassName = (status: SupportInquiryStatus): string => ({
  pending: 'bg-amber-50 text-amber-700',
  answered: 'bg-green-50 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
})[status];

export type MySupportInquiryListItem = {
  inquiryId: string;
  category: SupportInquiryCategory;
  subject: string;
  status: SupportInquiryStatus;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
};

export type MySupportInquiryDetail = MySupportInquiryListItem & {
  body: string;
  answerBody: string | null;
  answerUpdatedAt: string | null;
};

export type AdminSupportInquiryListItem = {
  inquiryId: string;
  userId: string;
  userNickname: string | null;
  profileExists: boolean;
  category: SupportInquiryCategory;
  subject: string;
  status: SupportInquiryStatus;
  createdAt: string;
  updatedAt: string;
  totalCount: number;
};

export type AdminSupportInquiryDetail = Omit<AdminSupportInquiryListItem, 'totalCount'> & {
  body: string;
  answerBody: string | null;
  answeredAt: string | null;
  answerUpdatedAt: string | null;
};

export type AdminSupportInquiryAction = {
  actionId: string;
  action: 'answer' | 'answer_update' | 'close';
  previousStatus: SupportInquiryStatus;
  newStatus: SupportInquiryStatus;
  adminUserId: string | null;
  adminRole: string | null;
  createdAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ['answer', 'answer_update', 'close'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
export const isSupportInquiryCategory = (value: unknown): value is SupportInquiryCategory => (
  typeof value === 'string' && SUPPORT_INQUIRY_CATEGORIES.includes(value as SupportInquiryCategory)
);
export const isSupportInquiryStatus = (value: unknown): value is SupportInquiryStatus => (
  typeof value === 'string' && SUPPORT_INQUIRY_STATUSES.includes(value as SupportInquiryStatus)
);
const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isNullableDate = (value: unknown): value is string | null => value === null || isDate(value);
const isNullableText = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isNullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const parseCount = (value: unknown): number | null => {
  const count = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
};
const hasValidAnswerLifecycle = (
  status: SupportInquiryStatus,
  answerBody: string | null,
  answeredAt: string | null,
  answerUpdatedAt: string | null,
) => status === 'pending'
  ? answerBody === null && answeredAt === null && answerUpdatedAt === null
  : typeof answerBody === 'string' && answerBody.length > 0 && answeredAt !== null && answerUpdatedAt !== null;

export function parseMySupportInquiryList(value: unknown): MySupportInquiryListItem[] | null {
  if (!Array.isArray(value)) return null;
  const result: MySupportInquiryListItem[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.inquiry_id) || !isSupportInquiryCategory(row.category)
      || typeof row.subject !== 'string' || !isSupportInquiryStatus(row.status)
      || !isDate(row.created_at) || !isDate(row.updated_at) || !isNullableDate(row.answered_at)
      || (row.status === 'pending' ? row.answered_at !== null : row.answered_at === null)) return null;
    result.push({ inquiryId: row.inquiry_id, category: row.category, subject: row.subject,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, answeredAt: row.answered_at });
  }
  return result;
}

export function parseMySupportInquiryDetail(value: unknown): MySupportInquiryDetail | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (!isUuid(row.inquiry_id) || !isSupportInquiryCategory(row.category)
    || typeof row.subject !== 'string' || typeof row.body !== 'string'
    || !isSupportInquiryStatus(row.status) || !isNullableText(row.answer_body)
    || !isNullableDate(row.answered_at) || !isNullableDate(row.answer_updated_at)
    || !isDate(row.created_at) || !isDate(row.updated_at)) return null;
  if (!hasValidAnswerLifecycle(row.status, row.answer_body, row.answered_at, row.answer_updated_at)) return null;
  return { inquiryId: row.inquiry_id, category: row.category, subject: row.subject, body: row.body,
    status: row.status, answerBody: row.answer_body, answeredAt: row.answered_at,
    answerUpdatedAt: row.answer_updated_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function parseAdminSupportInquiryList(value: unknown): AdminSupportInquiryListItem[] | null {
  if (!Array.isArray(value)) return null;
  const result: AdminSupportInquiryListItem[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const totalCount = parseCount(row.total_count);
    if (!isUuid(row.inquiry_id) || !isUuid(row.user_id) || !isNullableText(row.user_nickname)
      || typeof row.profile_exists !== 'boolean' || !isSupportInquiryCategory(row.category)
      || typeof row.subject !== 'string' || !isSupportInquiryStatus(row.status)
      || !isDate(row.created_at) || !isDate(row.updated_at) || totalCount === null) return null;
    result.push({ inquiryId: row.inquiry_id, userId: row.user_id, userNickname: row.user_nickname,
      profileExists: row.profile_exists, category: row.category, subject: row.subject,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, totalCount });
  }
  return result;
}

export function parseAdminSupportInquiryDetail(value: unknown): AdminSupportInquiryDetail | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (!isUuid(row.inquiry_id) || !isUuid(row.user_id) || !isNullableText(row.user_nickname)
    || typeof row.profile_exists !== 'boolean' || !isSupportInquiryCategory(row.category)
    || typeof row.subject !== 'string' || typeof row.body !== 'string'
    || !isSupportInquiryStatus(row.status) || !isNullableText(row.answer_body)
    || !isNullableDate(row.answered_at) || !isNullableDate(row.answer_updated_at)
    || !isDate(row.created_at) || !isDate(row.updated_at)) return null;
  if (!hasValidAnswerLifecycle(row.status, row.answer_body, row.answered_at, row.answer_updated_at)) return null;
  return { inquiryId: row.inquiry_id, userId: row.user_id, userNickname: row.user_nickname,
    profileExists: row.profile_exists, category: row.category, subject: row.subject,
    body: row.body, status: row.status, answerBody: row.answer_body,
    answeredAt: row.answered_at, answerUpdatedAt: row.answer_updated_at,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

export function parseAdminSupportInquiryActions(value: unknown): AdminSupportInquiryAction[] | null {
  if (!Array.isArray(value)) return null;
  const result: AdminSupportInquiryAction[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.action_id)
      || typeof row.action !== 'string' || !ACTIONS.includes(row.action as (typeof ACTIONS)[number])
      || !isSupportInquiryStatus(row.previous_status) || !isSupportInquiryStatus(row.new_status)
      || !isNullableUuid(row.admin_user_id) || !isNullableText(row.admin_role) || !isDate(row.created_at)) return null;
    result.push({ actionId: row.action_id, action: row.action as AdminSupportInquiryAction['action'],
      previousStatus: row.previous_status, newStatus: row.new_status,
      adminUserId: row.admin_user_id, adminRole: row.admin_role, createdAt: row.created_at });
  }
  return result;
}

export function parseInquiryMutationId(value: unknown): string | null {
  if (isUuid(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0]) && isUuid(value[0].inquiry_id)) {
    return value[0].inquiry_id;
  }
  return null;
}
