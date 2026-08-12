export const NOTICE_STATUSES = ['draft', 'published', 'archived'] as const;

export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export type PublicNoticeListItem = {
  noticeId: string;
  title: string;
  publishedAt: string;
};

export type PublicNoticeDetail = PublicNoticeListItem & {
  body: string;
};

export type AdminNoticeListItem = {
  noticeId: string;
  title: string;
  status: NoticeStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminNoticeDetail = AdminNoticeListItem & {
  body: string;
};

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  draft: '작성 중',
  published: '게시 중',
  archived: '보관됨',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

export const isNoticeStatus = (value: unknown): value is NoticeStatus => (
  typeof value === 'string' && NOTICE_STATUSES.includes(value as NoticeStatus)
);

const isDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const isNullableDateString = (value: unknown): value is string | null => (
  value === null || isDateString(value)
);

export const parsePublicNoticeList = (value: unknown): PublicNoticeListItem[] | null => {
  if (!Array.isArray(value)) return null;

  const notices: PublicNoticeListItem[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.notice_id)
      || typeof entry.title !== 'string'
      || !isDateString(entry.published_at)
    ) return null;

    notices.push({
      noticeId: entry.notice_id,
      title: entry.title,
      publishedAt: entry.published_at,
    });
  }
  return notices;
};

export const parsePublicNoticeDetail = (value: unknown): PublicNoticeDetail | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const entry = value[0];
  if (
    !isUuid(entry.notice_id)
    || typeof entry.title !== 'string'
    || typeof entry.body !== 'string'
    || !isDateString(entry.published_at)
  ) return null;

  return {
    noticeId: entry.notice_id,
    title: entry.title,
    body: entry.body,
    publishedAt: entry.published_at,
  };
};

export const parseAdminNoticeList = (value: unknown): AdminNoticeListItem[] | null => {
  if (!Array.isArray(value)) return null;

  const notices: AdminNoticeListItem[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.notice_id)
      || typeof entry.title !== 'string'
      || !isNoticeStatus(entry.status)
      || !isNullableDateString(entry.published_at)
      || !isDateString(entry.created_at)
      || !isDateString(entry.updated_at)
    ) return null;

    notices.push({
      noticeId: entry.notice_id,
      title: entry.title,
      status: entry.status,
      publishedAt: entry.published_at,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    });
  }
  return notices;
};

export const parseAdminNoticeDetail = (value: unknown): AdminNoticeDetail | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const entry = value[0];
  if (
    !isUuid(entry.notice_id)
    || typeof entry.title !== 'string'
    || typeof entry.body !== 'string'
    || !isNoticeStatus(entry.status)
    || !isNullableDateString(entry.published_at)
    || !isDateString(entry.created_at)
    || !isDateString(entry.updated_at)
  ) return null;

  return {
    noticeId: entry.notice_id,
    title: entry.title,
    body: entry.body,
    status: entry.status,
    publishedAt: entry.published_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
};

export const parseNoticeMutationResult = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  return isUuid(value[0].notice_id) ? value[0].notice_id : null;
};

export const getNoticeStatusClassName = (status: NoticeStatus): string => {
  if (status === 'published') return 'bg-green-100 text-green-800';
  if (status === 'draft') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-200 text-gray-700';
};
