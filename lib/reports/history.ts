export const REPORT_HISTORY_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'] as const;
export const REPORT_TARGET_TYPES = ['profile', 'message'] as const;
export const REPORT_REASON_CODES = [
  'inappropriate_content',
  'harassment',
  'fake_profile',
  'spam',
  'privacy_violation',
  'other',
] as const;

export type ReportHistoryStatus = (typeof REPORT_HISTORY_STATUSES)[number];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

export type ReportHistoryItem = {
  reportId: string;
  targetType: ReportTargetType;
  reasonCode: ReportReasonCode;
  reasonDetail: string | null;
  status: ReportHistoryStatus;
  createdAt: string;
  completedAt: string | null;
  targetDisplayName: string;
  targetDeleted: boolean;
};

type ReportHistoryRow = {
  report_id?: unknown;
  target_type?: unknown;
  reason_code?: unknown;
  reason_detail?: unknown;
  status?: unknown;
  created_at?: unknown;
  completed_at?: unknown;
  target_display_name?: unknown;
  target_deleted?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REPORT_STATUS_LABELS: Record<ReportHistoryStatus, string> = {
  pending: '접수됨',
  reviewing: '검토 중',
  resolved: '처리 완료',
  dismissed: '종결',
};

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  inappropriate_content: '부적절한 내용',
  harassment: '괴롭힘·모욕',
  fake_profile: '허위 프로필',
  spam: '광고·스팸',
  privacy_violation: '개인정보 침해',
  other: '기타',
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  profile: '회원 프로필',
  message: '채팅 메시지',
};

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Unexpected report history response');
  return value.trim() || null;
}

export function parseReportHistory(value: unknown): ReportHistoryItem[] {
  if (!Array.isArray(value)) throw new Error('Unexpected report history response');

  return value.map((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object') {
      throw new Error('Unexpected report history response');
    }

    const row = rawRow as ReportHistoryRow;
    const reportId = typeof row.report_id === 'string' ? row.report_id : '';
    const targetType = row.target_type;
    const reasonCode = typeof row.reason_code === 'string' ? row.reason_code.trim() : '';
    const reasonDetail = normalizeOptionalText(row.reason_detail);
    const status = row.status;
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
    const completedAt = normalizeOptionalText(row.completed_at);
    const targetDisplayName = typeof row.target_display_name === 'string'
      ? row.target_display_name.trim()
      : '';

    if (
      !UUID_PATTERN.test(reportId)
      || !REPORT_TARGET_TYPES.includes(targetType as ReportTargetType)
      || !REPORT_REASON_CODES.includes(reasonCode as ReportReasonCode)
      || !REPORT_HISTORY_STATUSES.includes(status as ReportHistoryStatus)
      || !isValidDate(createdAt)
      || (completedAt !== null && !isValidDate(completedAt))
      || !targetDisplayName
      || typeof row.target_deleted !== 'boolean'
    ) {
      throw new Error('Unexpected report history response');
    }

    return {
      reportId,
      targetType: targetType as ReportTargetType,
      reasonCode: reasonCode as ReportReasonCode,
      reasonDetail,
      status: status as ReportHistoryStatus,
      createdAt,
      completedAt,
      targetDisplayName,
      targetDeleted: row.target_deleted,
    };
  });
}
