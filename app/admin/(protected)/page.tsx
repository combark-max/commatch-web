import Link from 'next/link';
import { AlertCircle, ArrowRight, Crown, FileWarning, ShieldCheck, Users } from 'lucide-react';
import { requireAdminAccess, type AdminRole } from '@/lib/admin/access';
import {
  isMemberAccountStatus,
  isMemberProfileVisibility,
  isMemberRestrictionActionType,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  MEMBER_RESTRICTION_ACTION_LABELS,
  type MemberAccountStatus,
  type MemberProfileVisibility,
  type MemberRestrictionActionType,
} from '@/lib/admin/member-restrictions';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import {
  getPremiumStatusClassName,
  isPremiumFeatureKey,
  isPremiumMembershipStatus,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_MEMBERSHIP_ACTION_TYPES,
  PREMIUM_MEMBERSHIP_ACTION_LABELS,
  PREMIUM_STATUS_LABELS,
  type PremiumFeatureKey,
  type PremiumMembershipActionType,
  type PremiumMembershipStatus,
} from '@/lib/admin/premium-memberships';
import { isUuid } from '@/lib/admin/reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ReportSummary = {
  totalCount: string;
  pendingCount: string;
  reviewingCount: string;
  resolvedCount: string;
  dismissedCount: string;
};

type RecentReport = {
  reportId: string;
  targetType: string;
  reason: string;
  status: string;
  createdAt: string;
  reporterUserId: string;
  reportedUserId: string;
  messageId: string | null;
};

type OperationalSummary = {
  totalMemberCount: number;
  activeMemberCount: number;
  suspendedMemberCount: number;
  hiddenProfileCount: number;
  missingProfileCount: number;
  completedProfileCount: number;
  premiumAvailableCount: number;
  premiumNotStartedCount: number;
  premiumExpiredCount: number;
  premiumSuspendedCount: number;
  premiumRevokedCount: number;
  premiumExpiringSoonCount: number;
  expirationWindowDays: number;
};

type SummaryMetricCard = {
  label: string;
  count: string | number;
  href?: string;
  ariaLabel?: string;
};

type RecentMemberRestrictionAction = {
  actionId: string;
  actionType: MemberRestrictionActionType;
  subjectUserId: string;
  memberExists: boolean;
  profileExists: boolean;
  nickname: string | null;
  currentProfileVisibility: MemberProfileVisibility;
  previousAccountStatus: MemberAccountStatus;
  newAccountStatus: MemberAccountStatus;
  previousProfileVisibility: MemberProfileVisibility;
  newProfileVisibility: MemberProfileVisibility;
  previousSuspendedUntil: string | null;
  newSuspendedUntil: string | null;
  reason: string | null;
  note: string | null;
  reportId: string | null;
  reportExists: boolean;
  adminUserId: string | null;
  adminRole: AdminRole | null;
  createdAt: string;
};

type RecentPremiumMembershipAction = {
  actionId: string;
  requestId: string;
  membershipId: string | null;
  subjectUserId: string;
  memberExists: boolean;
  profileExists: boolean;
  nickname: string | null;
  currentProfileVisibility: MemberProfileVisibility;
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
  adminRole: AdminRole | null;
  membershipUpdatedAt: string;
  createdAt: string;
};

type ReportDataResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'forbidden' }
  | { kind: 'error' };

type ActivityDataResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'forbidden' }
  | { kind: 'rpc_error' }
  | { kind: 'parse_error' };

const reportDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

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

const isAdminRole = (value: unknown): value is AdminRole => (
  value === 'super_admin' || value === 'admin' || value === 'moderator'
);

const isPremiumMembershipActionType = (
  value: unknown,
): value is PremiumMembershipActionType => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_ACTION_TYPES.includes(value as PremiumMembershipActionType)
);

const parseFeatureKeys = (value: unknown): PremiumFeatureKey[] | null => {
  if (!Array.isArray(value) || !value.every(isPremiumFeatureKey)) return null;
  return new Set(value).size === value.length ? value : null;
};

const parseCount = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === 'bigint' && value >= BigInt(0)) return value.toString();
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
  return null;
};

const parseReportSummary = (value: unknown): ReportSummary | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  const totalCount = parseCount(row.total_count);
  const pendingCount = parseCount(row.pending_count);
  const reviewingCount = parseCount(row.reviewing_count);
  const resolvedCount = parseCount(row.resolved_count);
  const dismissedCount = parseCount(row.dismissed_count);

  if (
    totalCount === null
    || pendingCount === null
    || reviewingCount === null
    || resolvedCount === null
    || dismissedCount === null
  ) {
    return null;
  }

  return { totalCount, pendingCount, reviewingCount, resolvedCount, dismissedCount };
};

const parseOperationalCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const count = Number(value);
    return Number.isSafeInteger(count) ? count : null;
  }
  return null;
};

const parseOperationalSummary = (value: unknown): OperationalSummary | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  const totalMemberCount = parseOperationalCount(row.total_member_count);
  const activeMemberCount = parseOperationalCount(row.active_member_count);
  const suspendedMemberCount = parseOperationalCount(row.suspended_member_count);
  const hiddenProfileCount = parseOperationalCount(row.hidden_profile_count);
  const missingProfileCount = parseOperationalCount(row.missing_profile_count);
  const completedProfileCount = parseOperationalCount(row.completed_profile_count);
  const premiumAvailableCount = parseOperationalCount(row.premium_available_count);
  const premiumNotStartedCount = parseOperationalCount(row.premium_not_started_count);
  const premiumExpiredCount = parseOperationalCount(row.premium_expired_count);
  const premiumSuspendedCount = parseOperationalCount(row.premium_suspended_count);
  const premiumRevokedCount = parseOperationalCount(row.premium_revoked_count);
  const premiumExpiringSoonCount = parseOperationalCount(row.premium_expiring_soon_count);
  const expirationWindowDays = row.expiration_window_days;

  if (
    totalMemberCount === null
    || activeMemberCount === null
    || suspendedMemberCount === null
    || hiddenProfileCount === null
    || missingProfileCount === null
    || completedProfileCount === null
    || premiumAvailableCount === null
    || premiumNotStartedCount === null
    || premiumExpiredCount === null
    || premiumSuspendedCount === null
    || premiumRevokedCount === null
    || premiumExpiringSoonCount === null
    || typeof expirationWindowDays !== 'number'
    || !Number.isInteger(expirationWindowDays)
    || expirationWindowDays < 1
    || expirationWindowDays > 90
  ) return null;

  return {
    totalMemberCount,
    activeMemberCount,
    suspendedMemberCount,
    hiddenProfileCount,
    missingProfileCount,
    completedProfileCount,
    premiumAvailableCount,
    premiumNotStartedCount,
    premiumExpiredCount,
    premiumSuspendedCount,
    premiumRevokedCount,
    premiumExpiringSoonCount,
    expirationWindowDays,
  };
};

const parseRecentReports = (value: unknown): RecentReport[] | null => {
  if (!Array.isArray(value)) return null;

  const reports: RecentReport[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (
      typeof entry.report_id !== 'string'
      || typeof entry.target_type !== 'string'
      || typeof entry.reason !== 'string'
      || typeof entry.status !== 'string'
      || typeof entry.created_at !== 'string'
      || Number.isNaN(Date.parse(entry.created_at))
      || typeof entry.reporter_user_id !== 'string'
      || typeof entry.reported_user_id !== 'string'
      || (entry.message_id !== null && typeof entry.message_id !== 'string')
    ) {
      return null;
    }

    reports.push({
      reportId: entry.report_id,
      targetType: entry.target_type,
      reason: entry.reason,
      status: entry.status,
      createdAt: entry.created_at,
      reporterUserId: entry.reporter_user_id,
      reportedUserId: entry.reported_user_id,
      messageId: entry.message_id,
    });
  }

  return reports.length <= 5 ? reports : null;
};

const parseRecentMemberRestrictionActions = (
  value: unknown,
): RecentMemberRestrictionAction[] | null => {
  if (!Array.isArray(value)) return null;

  const actions: RecentMemberRestrictionAction[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.action_id)
      || !isMemberRestrictionActionType(entry.action_type)
      || !isUuid(entry.subject_user_id)
      || typeof entry.member_exists !== 'boolean'
      || typeof entry.profile_exists !== 'boolean'
      || !isNullableString(entry.nickname)
      || !isMemberProfileVisibility(entry.current_profile_visibility)
      || !isMemberAccountStatus(entry.previous_account_status)
      || !isMemberAccountStatus(entry.new_account_status)
      || !isMemberProfileVisibility(entry.previous_profile_visibility)
      || !isMemberProfileVisibility(entry.new_profile_visibility)
      || !isNullableDateString(entry.previous_suspended_until)
      || !isNullableDateString(entry.new_suspended_until)
      || !isNullableString(entry.reason)
      || !isNullableString(entry.note)
      || !isNullableUuid(entry.report_id)
      || typeof entry.report_exists !== 'boolean'
      || !isNullableUuid(entry.admin_user_id)
      || !(entry.admin_role === null || isAdminRole(entry.admin_role))
      || !isDateString(entry.created_at)
      || (entry.report_exists && entry.report_id === null)
    ) return null;

    actions.push({
      actionId: entry.action_id,
      actionType: entry.action_type,
      subjectUserId: entry.subject_user_id,
      memberExists: entry.member_exists,
      profileExists: entry.profile_exists,
      nickname: entry.nickname,
      currentProfileVisibility: entry.current_profile_visibility,
      previousAccountStatus: entry.previous_account_status,
      newAccountStatus: entry.new_account_status,
      previousProfileVisibility: entry.previous_profile_visibility,
      newProfileVisibility: entry.new_profile_visibility,
      previousSuspendedUntil: entry.previous_suspended_until,
      newSuspendedUntil: entry.new_suspended_until,
      reason: entry.reason,
      note: entry.note,
      reportId: entry.report_id,
      reportExists: entry.report_exists,
      adminUserId: entry.admin_user_id,
      adminRole: entry.admin_role,
      createdAt: entry.created_at,
    });
  }

  return actions.length <= 5 ? actions : null;
};

const parseRecentPremiumMembershipActions = (
  value: unknown,
): RecentPremiumMembershipAction[] | null => {
  if (!Array.isArray(value)) return null;

  const actions: RecentPremiumMembershipAction[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const previousFeatureKeys = entry.previous_feature_keys === null
      ? null
      : parseFeatureKeys(entry.previous_feature_keys);
    const newFeatureKeys = parseFeatureKeys(entry.new_feature_keys);
    if (
      !isUuid(entry.action_id)
      || !isUuid(entry.request_id)
      || !isNullableUuid(entry.membership_id)
      || !isUuid(entry.subject_user_id)
      || typeof entry.member_exists !== 'boolean'
      || typeof entry.profile_exists !== 'boolean'
      || !isNullableString(entry.nickname)
      || !isMemberProfileVisibility(entry.current_profile_visibility)
      || !isPremiumMembershipActionType(entry.action_type)
      || !(entry.previous_status === null || isPremiumMembershipStatus(entry.previous_status))
      || !isPremiumMembershipStatus(entry.new_status)
      || !isNullableDateString(entry.previous_started_at)
      || !isDateString(entry.new_started_at)
      || !isNullableDateString(entry.previous_expires_at)
      || !isNullableDateString(entry.new_expires_at)
      || (previousFeatureKeys === null && entry.previous_feature_keys !== null)
      || newFeatureKeys === null
      || newFeatureKeys.length < 1
      || newFeatureKeys.length > 3
      || typeof entry.reason !== 'string'
      || entry.reason.trim() !== entry.reason
      || entry.reason.length < 1
      || entry.reason.length > 500
      || !isUuid(entry.performed_by)
      || !(entry.admin_role === null || isAdminRole(entry.admin_role))
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
          || previousFeatureKeys.length > 3
    ) return null;

    actions.push({
      actionId: entry.action_id,
      requestId: entry.request_id,
      membershipId: entry.membership_id,
      subjectUserId: entry.subject_user_id,
      memberExists: entry.member_exists,
      profileExists: entry.profile_exists,
      nickname: entry.nickname,
      currentProfileVisibility: entry.current_profile_visibility,
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
      adminRole: entry.admin_role,
      membershipUpdatedAt: entry.membership_updated_at,
      createdAt: entry.created_at,
    });
  }

  return actions.length <= 5 ? actions : null;
};

const getTargetLabel = (targetType: string) => {
  if (targetType === 'profile') return '회원 프로필';
  if (targetType === 'message') return '채팅 메시지';
  return '기타';
};

const getReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    inappropriate_content: '부적절한 내용',
    harassment: '괴롭힘',
    fake_profile: '허위 프로필',
    spam: '스팸 또는 광고',
    privacy_violation: '개인정보 침해',
    other: '기타',
  };
  return labels[reason] ?? '기타';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    pending: '접수 대기',
    reviewing: '검토 중',
    resolved: '처리 완료',
    dismissed: '기각',
  };
  return labels[status] ?? '기타';
};

const getStatusClassName = (status: string) => {
  if (status === 'pending') return 'bg-amber-100 text-amber-800';
  if (status === 'reviewing') return 'bg-blue-100 text-blue-800';
  if (status === 'resolved') return 'bg-green-100 text-green-800';
  if (status === 'dismissed') return 'bg-gray-200 text-gray-700';
  return 'bg-gray-100 text-gray-600';
};

const formatReportDate = (value: string) => reportDateFormatter.format(new Date(value));

const formatNullableDate = (value: string | null, emptyLabel = '해당 없음') => (
  value ? formatReportDate(value) : emptyLabel
);

const formatPremiumPeriod = (startedAt: string | null, expiresAt: string | null) => (
  startedAt
    ? `${formatReportDate(startedAt)} ~ ${formatNullableDate(expiresAt, '무기한')}`
    : '해당 없음'
);

const formatFeatureKeys = (featureKeys: PremiumFeatureKey[] | null) => (
  featureKeys?.length
    ? featureKeys.map((featureKey) => PREMIUM_FEATURE_LABELS[featureKey]).join(', ')
    : '해당 없음'
);

const getMemberStatusClassName = (status: MemberAccountStatus) => (
  status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
);

const getAdminLabel = (role: AdminRole | null, userId: string | null) => {
  if (role) return getAdminRoleLabel(role);
  return userId ? '관리자 계정 연결 없음' : '처리 관리자 정보 없음';
};

const getErrorKind = (error: { code?: string } | null): 'forbidden' | 'error' => (
  error?.code === '42501' ? 'forbidden' : 'error'
);

async function loadReportSummary(): Promise<ReportDataResult<ReportSummary>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_report_summary');
  if (error) return { kind: getErrorKind(error) };

  const summary = parseReportSummary(data);
  return summary ? { kind: 'success', data: summary } : { kind: 'error' };
}

async function loadRecentReports(): Promise<ReportDataResult<RecentReport[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_recent_reports', { limit_count: 5 });
  if (error) return { kind: getErrorKind(error) };

  const reports = parseRecentReports(data);
  return reports ? { kind: 'success', data: reports } : { kind: 'error' };
}

async function loadOperationalSummary(): Promise<ReportDataResult<OperationalSummary>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_dashboard_operational_summary', {
    p_expiring_days: 30,
  });
  if (error) return { kind: getErrorKind(error) };

  const summary = parseOperationalSummary(data);
  return summary ? { kind: 'success', data: summary } : { kind: 'error' };
}

async function loadRecentMemberRestrictionActions(): Promise<
  ActivityDataResult<RecentMemberRestrictionAction[]>
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    'get_admin_recent_member_restriction_actions',
    { p_limit: 5 },
  );
  if (error) return { kind: error.code === '42501' ? 'forbidden' : 'rpc_error' };

  const actions = parseRecentMemberRestrictionActions(data);
  return actions ? { kind: 'success', data: actions } : { kind: 'parse_error' };
}

async function loadRecentPremiumMembershipActions(): Promise<
  ActivityDataResult<RecentPremiumMembershipAction[]>
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    'get_admin_recent_premium_membership_actions',
    { p_limit: 5 },
  );
  if (error) return { kind: error.code === '42501' ? 'forbidden' : 'rpc_error' };

  const actions = parseRecentPremiumMembershipActions(data);
  return actions ? { kind: 'success', data: actions } : { kind: 'parse_error' };
}

const ReportError = ({ forbidden }: { forbidden: boolean }) => (
  <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800">
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {forbidden ? '신고 조회 권한이 없습니다.' : '신고 현황을 불러오지 못했습니다.'}
        </p>
        <a href="/admin" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">
          다시 시도
        </a>
      </div>
    </div>
  </div>
);

const OperationalStatsError = ({ forbidden }: { forbidden: boolean }) => (
  <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800">
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {forbidden ? '운영 통계 조회 권한이 없습니다.' : '운영 통계를 불러오지 못했습니다.'}
        </p>
        <a href="/admin" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">
          다시 시도
        </a>
      </div>
    </div>
  </div>
);

const ActivityError = ({ message }: { message: string }) => (
  <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800">
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <div>
        <p className="font-semibold">{message}</p>
        <a href="/admin" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">
          다시 시도
        </a>
      </div>
    </div>
  </div>
);

const SummaryMetricCardView = ({
  label,
  count,
  href,
  ariaLabel,
}: SummaryMetricCard) => {
  const content = (
    <>
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-gray-900">{count}</p>
    </>
  );
  const className = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';

  return href ? (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`${className} transition-colors hover:border-green-200 hover:bg-green-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2`}
    >
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
};

const getRestrictionActivityErrorMessage = (
  result: Exclude<ActivityDataResult<RecentMemberRestrictionAction[]>, { kind: 'success' }>,
) => {
  if (result.kind === 'forbidden') return '회원 제재 이력 조회 권한이 없습니다.';
  if (result.kind === 'parse_error') return '최근 회원 제재 응답을 확인하지 못했습니다.';
  return '최근 회원 제재 내역을 불러오지 못했습니다.';
};

const getPremiumActivityErrorMessage = (
  result: Exclude<ActivityDataResult<RecentPremiumMembershipAction[]>, { kind: 'success' }>,
) => {
  if (result.kind === 'forbidden') return 'Premium 변경 이력 조회 권한이 없습니다.';
  if (result.kind === 'parse_error') return '최근 Premium 변경 응답을 확인하지 못했습니다.';
  return '최근 Premium 변경 내역을 불러오지 못했습니다.';
};

export default async function AdminDashboardPage() {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');
  const [
    summaryResult,
    operationalSummaryResult,
    recentReportsResult,
    recentRestrictionActionsResult,
    recentPremiumActionsResult,
  ] = await Promise.all([
    loadReportSummary(),
    loadOperationalSummary(),
    loadRecentReports(),
    loadRecentMemberRestrictionActions(),
    loadRecentPremiumMembershipActions(),
  ]);

  const summaryCards: SummaryMetricCard[] = summaryResult.kind === 'success'
    ? [
        {
          label: '전체 신고',
          count: summaryResult.data.totalCount,
          href: '/admin/reports',
          ariaLabel: '전체 신고 목록 보기',
        },
        {
          label: '접수 대기',
          count: summaryResult.data.pendingCount,
          href: '/admin/reports?status=pending',
          ariaLabel: '접수 대기 신고 목록 보기',
        },
        {
          label: '검토 중',
          count: summaryResult.data.reviewingCount,
          href: '/admin/reports?status=reviewing',
          ariaLabel: '검토 중 신고 목록 보기',
        },
        {
          label: '처리 완료',
          count: summaryResult.data.resolvedCount,
          href: '/admin/reports?status=resolved',
          ariaLabel: '처리 완료 신고 목록 보기',
        },
        {
          label: '기각',
          count: summaryResult.data.dismissedCount,
          href: '/admin/reports?status=dismissed',
          ariaLabel: '기각 신고 목록 보기',
        },
      ]
    : [];
  const memberSummaryCards: [string, number, string | null][] = operationalSummaryResult.kind === 'success'
    ? [
        ['전체 회원', operationalSummaryResult.data.totalMemberCount, null],
        ['활성 회원', operationalSummaryResult.data.activeMemberCount, null],
        ['정지 회원', operationalSummaryResult.data.suspendedMemberCount, null],
        ['숨김 프로필', operationalSummaryResult.data.hiddenProfileCount, null],
        ['프로필 미작성', operationalSummaryResult.data.missingProfileCount, null],
        [
          '프로필 작성 완료',
          operationalSummaryResult.data.completedProfileCount,
          '필수 프로필 정보를 모두 입력한 회원',
        ],
      ]
    : [];
  const premiumSummaryCards: SummaryMetricCard[] = operationalSummaryResult.kind === 'success'
    ? [
        {
          label: 'Premium 이용 가능',
          count: operationalSummaryResult.data.premiumAvailableCount,
        },
        {
          label: '시작 전',
          count: operationalSummaryResult.data.premiumNotStartedCount,
        },
        {
          label: '만료',
          count: operationalSummaryResult.data.premiumExpiredCount,
        },
        {
          label: 'Premium 정지',
          count: operationalSummaryResult.data.premiumSuspendedCount,
          href: '/admin/premium?status=suspended',
          ariaLabel: 'Premium 정지 회원 목록 보기',
        },
        {
          label: 'Premium 회수',
          count: operationalSummaryResult.data.premiumRevokedCount,
          href: '/admin/premium?status=revoked',
          ariaLabel: 'Premium 회수 회원 목록 보기',
        },
        {
          label: `${operationalSummaryResult.data.expirationWindowDays}일 내 만료 예정`,
          count: operationalSummaryResult.data.premiumExpiringSoonCount,
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-bold text-green-700">{getAdminRoleLabel(adminAccess.role)}</p>
        <h1 className="mt-2 text-3xl font-black text-gray-900">관리자 대시보드</h1>
        <p className="mt-3 text-gray-600">신고 접수 현황과 최근 신고를 확인할 수 있습니다.</p>
      </section>

      <section aria-labelledby="report-summary-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="report-summary-heading" className="text-xl font-black text-gray-900">신고 현황</h2>
          <FileWarning className="text-gray-400" size={22} aria-hidden="true" />
        </div>
        {summaryResult.kind === 'success' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {summaryCards.map((card) => (
              <SummaryMetricCardView key={card.label} {...card} />
            ))}
          </div>
        ) : (
          <ReportError forbidden={summaryResult.kind === 'forbidden'} />
        )}
      </section>

      {operationalSummaryResult.kind === 'success' ? (
        <>
          <section aria-labelledby="member-summary-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="member-summary-heading" className="text-xl font-black text-gray-900">회원 현황</h2>
              <Users className="text-gray-400" size={22} aria-hidden="true" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {memberSummaryCards.map(([label, count, description]) => (
                <article key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-gray-500">{label}</p>
                  <p className="mt-3 text-3xl font-black text-gray-900">{count}</p>
                  {description ? (
                    <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="premium-summary-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="premium-summary-heading" className="text-xl font-black text-gray-900">Premium 현황</h2>
              <Crown className="text-gray-400" size={22} aria-hidden="true" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {premiumSummaryCards.map((card) => (
                <SummaryMetricCardView key={card.label} {...card} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section aria-labelledby="operational-summary-heading">
          <h2 id="operational-summary-heading" className="mb-4 text-xl font-black text-gray-900">운영 현황</h2>
          <OperationalStatsError forbidden={operationalSummaryResult.kind === 'forbidden'} />
        </section>
      )}

      <section aria-labelledby="recent-reports-heading" className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="recent-reports-heading" className="text-xl font-black text-gray-900">최근 신고</h2>
            <p className="mt-1 text-sm text-gray-500">최근 접수된 신고를 최대 5건 표시합니다.</p>
          </div>
          {adminAccess.permissions.includes('reports_view') ? (
            <Link href="/admin/reports" className="inline-flex items-center gap-1 text-sm font-bold text-green-700 hover:text-green-800">
              신고 관리로 이동 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {recentReportsResult.kind === 'success' ? (
          recentReportsResult.data.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">접수된 신고가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">신고 대상</th>
                    <th scope="col" className="px-6 py-3 font-semibold">신고 사유</th>
                    <th scope="col" className="px-6 py-3 font-semibold">상태</th>
                    <th scope="col" className="px-6 py-3 font-semibold">접수일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentReportsResult.data.map((report) => (
                    <tr key={report.reportId}>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        <Link href={`/admin/reports/${report.reportId}`} className="hover:text-green-700 hover:underline">
                          {getTargetLabel(report.targetType)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{getReasonLabel(report.reason)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClassName(report.status)}`}>
                          {getStatusLabel(report.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{formatReportDate(report.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="p-5 sm:p-6">
            <ReportError forbidden={recentReportsResult.kind === 'forbidden'} />
          </div>
        )}
      </section>

      <section aria-labelledby="recent-restriction-actions-heading" className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="recent-restriction-actions-heading" className="text-xl font-black text-gray-900">최근 회원 제재</h2>
            <p className="mt-1 text-sm text-gray-500">최근 처리된 회원 제재를 최대 5건 표시합니다.</p>
          </div>
          <ShieldCheck className="text-gray-400" size={22} aria-hidden="true" />
        </div>

        {recentRestrictionActionsResult.kind === 'success' ? (
          recentRestrictionActionsResult.data.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">최근 회원 제재 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1520px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {['대상 회원', '조치', '상태 변경', '정지 종료', '사유·메모', '관련 신고', '처리 관리자', '처리 시각'].map((label) => (
                      <th key={label} scope="col" className="px-5 py-3 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentRestrictionActionsResult.data.map((action) => {
                    const canViewProfile = action.memberExists
                      && action.profileExists
                      && action.currentProfileVisibility === 'visible';
                    const memberLabel = action.nickname
                      ?? (action.memberExists ? '닉네임 정보 없음' : '탈퇴 또는 회원 정보 없음');
                    const suspensionChanged = action.previousSuspendedUntil
                      !== action.newSuspendedUntil;
                    return (
                      <tr key={action.actionId} className="align-top">
                        <td className="px-5 py-4">
                          {canViewProfile ? (
                            <Link
                              href={`/members/${action.subjectUserId}`}
                              className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline"
                            >
                              {memberLabel}
                            </Link>
                          ) : (
                            <p className="font-bold text-gray-900">{memberLabel}</p>
                          )}
                          <p className="mt-1 font-mono text-xs text-gray-500">{action.subjectUserId.slice(0, 8)}</p>
                          {!action.memberExists ? (
                            <p className="mt-1 text-xs font-semibold text-red-700">탈퇴 또는 회원 정보 없음</p>
                          ) : null}
                          {!action.profileExists ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">프로필 없음</p>
                          ) : null}
                          {canViewProfile ? (
                            <Link href={`/members/${action.subjectUserId}`} className="mt-2 inline-block text-xs font-bold text-green-700 hover:text-green-800">
                              프로필 보기
                            </Link>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-bold text-gray-900">
                          {MEMBER_RESTRICTION_ACTION_LABELS[action.actionType]}
                        </td>
                        <td className="px-5 py-4 text-gray-700">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getMemberStatusClassName(action.previousAccountStatus)}`}>
                              {MEMBER_ACCOUNT_STATUS_LABELS[action.previousAccountStatus]}
                            </span>
                            <span aria-hidden="true">→</span>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getMemberStatusClassName(action.newAccountStatus)}`}>
                              {MEMBER_ACCOUNT_STATUS_LABELS[action.newAccountStatus]}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-nowrap text-xs text-gray-500">
                            프로필: {MEMBER_PROFILE_VISIBILITY_LABELS[action.previousProfileVisibility]}
                            {' → '}
                            {MEMBER_PROFILE_VISIBILITY_LABELS[action.newProfileVisibility]}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {suspensionChanged ? (
                            <>
                              {formatNullableDate(action.previousSuspendedUntil, '없음·무기한')}
                              <span className="mx-2" aria-hidden="true">→</span>
                              {formatNullableDate(action.newSuspendedUntil, '없음·무기한')}
                            </>
                          ) : '변경 없음'}
                        </td>
                        <td className="max-w-[280px] px-5 py-4 text-gray-700">
                          <p className="truncate" title={action.reason ?? undefined}>
                            <span className="font-semibold text-gray-500">사유:</span> {action.reason ?? '해당 없음'}
                          </p>
                          <p className="mt-2 truncate" title={action.note ?? undefined}>
                            <span className="font-semibold text-gray-500">메모:</span> {action.note ?? '해당 없음'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {action.reportId && action.reportExists ? (
                            <Link href={`/admin/reports/${action.reportId}`} className="font-bold text-green-700 hover:text-green-800 hover:underline">
                              신고 {action.reportId.slice(0, 8)}
                            </Link>
                          ) : (
                            <span className="text-gray-500">연결된 신고 없음</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          <p className="font-semibold text-gray-900">{getAdminLabel(action.adminRole, action.adminUserId)}</p>
                          {action.adminUserId ? (
                            <p className="mt-1 font-mono text-xs text-gray-500">{action.adminUserId.slice(0, 8)}</p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                          <time dateTime={action.createdAt}>{formatReportDate(action.createdAt)}</time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="p-5 sm:p-6">
            <ActivityError message={getRestrictionActivityErrorMessage(recentRestrictionActionsResult)} />
          </div>
        )}
      </section>

      <section aria-labelledby="recent-premium-actions-heading" className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="recent-premium-actions-heading" className="text-xl font-black text-gray-900">최근 Premium 변경</h2>
            <p className="mt-1 text-sm text-gray-500">최근 처리된 Premium 변경을 최대 5건 표시합니다.</p>
          </div>
          <Crown className="text-gray-400" size={22} aria-hidden="true" />
        </div>

        {recentPremiumActionsResult.kind === 'success' ? (
          recentPremiumActionsResult.data.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">최근 Premium 변경 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1880px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {['대상 회원', '조치', '상태 변경', '이전 기간', '새 기간', '이전 기능', '새 기능', '사유', '처리 관리자', '처리 시각'].map((label) => (
                      <th key={label} scope="col" className="px-5 py-3 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentPremiumActionsResult.data.map((action) => {
                    const canViewProfile = action.memberExists
                      && action.profileExists
                      && action.currentProfileVisibility === 'visible';
                    const memberLabel = action.nickname
                      ?? (action.memberExists ? '닉네임 정보 없음' : '탈퇴 또는 회원 정보 없음');
                    const previousFeatures = formatFeatureKeys(action.previousFeatureKeys);
                    const newFeatures = formatFeatureKeys(action.newFeatureKeys);
                    return (
                      <tr key={action.actionId} className="align-top">
                        <td className="px-5 py-4">
                          {canViewProfile ? (
                            <Link
                              href={`/members/${action.subjectUserId}`}
                              className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline"
                            >
                              {memberLabel}
                            </Link>
                          ) : (
                            <p className="font-bold text-gray-900">{memberLabel}</p>
                          )}
                          <p className="mt-1 font-mono text-xs text-gray-500">{action.subjectUserId.slice(0, 8)}</p>
                          {!action.memberExists ? (
                            <p className="mt-1 text-xs font-semibold text-red-700">탈퇴 또는 회원 정보 없음</p>
                          ) : null}
                          {!action.profileExists ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">프로필 없음</p>
                          ) : null}
                          <div className="mt-2 flex gap-3 whitespace-nowrap">
                            {canViewProfile ? (
                              <Link href={`/members/${action.subjectUserId}`} className="text-xs font-bold text-green-700 hover:text-green-800">
                                프로필 보기
                              </Link>
                            ) : null}
                            {action.memberExists ? (
                              <Link href={`/admin/premium/${action.subjectUserId}`} className="text-xs font-bold text-green-700 hover:text-green-800">
                                Premium 상세
                              </Link>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-bold text-gray-900">
                          {PREMIUM_MEMBERSHIP_ACTION_LABELS[action.actionType]}
                        </td>
                        <td className="px-5 py-4 text-gray-700">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {action.previousStatus ? (
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPremiumStatusClassName(action.previousStatus)}`}>
                                {PREMIUM_STATUS_LABELS[action.previousStatus]}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">해당 없음</span>
                            )}
                            <span aria-hidden="true">→</span>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPremiumStatusClassName(action.newStatus)}`}>
                              {PREMIUM_STATUS_LABELS[action.newStatus]}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {formatPremiumPeriod(action.previousStartedAt, action.previousExpiresAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {formatPremiumPeriod(action.newStartedAt, action.newExpiresAt)}
                        </td>
                        <td className="max-w-[240px] px-5 py-4 text-gray-700">
                          <p className="truncate" title={previousFeatures}>{previousFeatures}</p>
                        </td>
                        <td className="max-w-[240px] px-5 py-4 text-gray-700">
                          <p className="truncate" title={newFeatures}>{newFeatures}</p>
                        </td>
                        <td className="max-w-[280px] px-5 py-4 text-gray-700">
                          <p className="truncate" title={action.reason}>{action.reason}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          <p className="font-semibold text-gray-900">{getAdminLabel(action.adminRole, action.performedBy)}</p>
                          <p className="mt-1 font-mono text-xs text-gray-500">{action.performedBy.slice(0, 8)}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                          <time dateTime={action.createdAt}>{formatReportDate(action.createdAt)}</time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="p-5 sm:p-6">
            <ActivityError message={getPremiumActivityErrorMessage(recentPremiumActionsResult)} />
          </div>
        )}
      </section>

      <section aria-labelledby="upcoming-admin-features" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="upcoming-admin-features" className="text-xl font-black text-gray-900">준비 중인 관리자 기능</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {['회원 관리 — 준비 중', '관리자 계정 관리 — 준비 중', '서비스 통계 — 준비 중'].map((label) => (
            <div key={label} className="rounded-2xl bg-gray-100 px-4 py-4 text-sm font-semibold text-gray-500">
              {label}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
