import Link from 'next/link';
import { AlertCircle, ChevronRight, MessagesSquare } from 'lucide-react';
import AdminDashboardSection from '@/components/admin/dashboard/AdminDashboardSection';
import AdminMetricCard, { type AdminMetric } from '@/components/admin/dashboard/AdminMetricCard';
import { requireAdminAccess, type AdminRole } from '@/lib/admin/access';
import { parseAdminPremiumMembershipList } from '@/lib/admin/premium-memberships';
import {
  parseAdminServiceStatistics,
  type AdminServiceStatistics,
} from '@/lib/admin/service-statistics';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { parseAdminSupportInquiryList } from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ReportSummary = { totalCount: string; pendingCount: string; reviewingCount: string; resolvedCount: string; dismissedCount: string };
type OperationalSummary = {
  totalMemberCount: number; activeMemberCount: number; suspendedMemberCount: number;
  hiddenProfileCount: number; missingProfileCount: number; completedProfileCount: number;
  premiumAvailableCount: number; premiumNotStartedCount: number; premiumExpiredCount: number;
  premiumSuspendedCount: number; premiumRevokedCount: number; premiumExpiringSoonCount: number;
  expirationWindowDays: number;
};
type DataResult<T> = { kind: 'success'; data: T } | { kind: 'forbidden' | 'error' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const parseCountString = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
  return null;
};
const parseCountNumber = (value: unknown): number | null => {
  const parsed = parseCountString(value);
  if (parsed === null) return null;
  const count = Number(parsed);
  return Number.isSafeInteger(count) ? count : null;
};
const parseReportSummary = (value: unknown): ReportSummary | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const counts = [row.total_count, row.pending_count, row.reviewing_count, row.resolved_count, row.dismissed_count].map(parseCountString);
  if (counts.some((count) => count === null)) return null;
  return { totalCount: counts[0]!, pendingCount: counts[1]!, reviewingCount: counts[2]!, resolvedCount: counts[3]!, dismissedCount: counts[4]! };
};
const parseOperationalSummary = (value: unknown): OperationalSummary | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const keys = ['total_member_count', 'active_member_count', 'suspended_member_count', 'hidden_profile_count', 'missing_profile_count', 'completed_profile_count', 'premium_available_count', 'premium_not_started_count', 'premium_expired_count', 'premium_suspended_count', 'premium_revoked_count', 'premium_expiring_soon_count'] as const;
  const counts = keys.map((key) => parseCountNumber(row[key]));
  if (counts.some((count) => count === null) || typeof row.expiration_window_days !== 'number' || !Number.isInteger(row.expiration_window_days)) return null;
  return {
    totalMemberCount: counts[0]!, activeMemberCount: counts[1]!, suspendedMemberCount: counts[2]!,
    hiddenProfileCount: counts[3]!, missingProfileCount: counts[4]!, completedProfileCount: counts[5]!,
    premiumAvailableCount: counts[6]!, premiumNotStartedCount: counts[7]!, premiumExpiredCount: counts[8]!,
    premiumSuspendedCount: counts[9]!, premiumRevokedCount: counts[10]!, premiumExpiringSoonCount: counts[11]!,
    expirationWindowDays: row.expiration_window_days,
  };
};
const errorKind = (error: { code?: string } | null): 'forbidden' | 'error' => error?.code === '42501' ? 'forbidden' : 'error';

async function loadReportSummary(): Promise<DataResult<ReportSummary>> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc('get_admin_report_summary');
  if (error) return { kind: errorKind(error) };
  const parsed = parseReportSummary(data);
  return parsed ? { kind: 'success', data: parsed } : { kind: 'error' };
}
async function loadOperationalSummary(): Promise<DataResult<OperationalSummary>> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc('get_admin_dashboard_operational_summary', { p_expiring_days: 30 });
  if (error) return { kind: errorKind(error) };
  const parsed = parseOperationalSummary(data);
  return parsed ? { kind: 'success', data: parsed } : { kind: 'error' };
}
async function loadServiceStatistics(): Promise<DataResult<AdminServiceStatistics>> {
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc('get_admin_service_statistics');
    if (error) return { kind: errorKind(error) };
    return { kind: 'success', data: parseAdminServiceStatistics(data) };
  } catch {
    return { kind: 'error' };
  }
}
async function loadPremiumCount(): Promise<DataResult<{ totalCount: number }>> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc('get_admin_premium_memberships', {
    p_search: null, p_status: 'exists', p_limit: 1, p_offset: 0,
    p_sort_key: 'updated_at', p_sort_direction: 'desc',
  });
  if (error) return { kind: errorKind(error) };
  const memberships = parseAdminPremiumMembershipList(data);
  if (!memberships) return { kind: 'error' };
  return { kind: 'success', data: { totalCount: memberships[0]?.totalCount ?? 0 } };
}

async function loadPendingInquiryCount(): Promise<DataResult<{ totalCount: number }>> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc('get_admin_support_inquiries', {
    p_status: 'pending', p_page: 1, p_page_size: 1,
  });
  if (error) return { kind: errorKind(error) };
  const inquiries = parseAdminSupportInquiryList(data);
  if (!inquiries) return { kind: 'error' };
  return { kind: 'success', data: { totalCount: inquiries[0]?.totalCount ?? 0 } };
}

const ErrorBox = ({ message, href = '/admin' }: { message: string; href?: string }) => <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div><p className="font-semibold">{message}</p><a href={href} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a></div></div></div>;

export default async function AdminDashboardPage() {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');
  const canViewSupportInquiries = adminAccess.permissions.includes('support_inquiries_view');
  const [summaryResult, operationalResult, premiumResult, serviceStatisticsResult, pendingInquiryResult] = await Promise.all([
    loadReportSummary(), loadOperationalSummary(), loadPremiumCount(),
    loadServiceStatistics(),
    canViewSupportInquiries ? loadPendingInquiryCount() : Promise.resolve(null),
  ]);
  const summaryCards: AdminMetric[] = summaryResult.kind === 'success' ? [
    { label: '전체 신고', count: summaryResult.data.totalCount, href: '/admin/reports', ariaLabel: '전체 신고 목록 보기' },
    { label: '접수 대기', count: summaryResult.data.pendingCount, href: '/admin/reports?status=pending', ariaLabel: '접수 대기 신고 목록 보기' },
    { label: '검토 중', count: summaryResult.data.reviewingCount, href: '/admin/reports?status=reviewing', ariaLabel: '검토 중 신고 목록 보기' },
    { label: '처리 완료', count: summaryResult.data.resolvedCount, href: '/admin/reports?status=resolved', ariaLabel: '처리 완료 신고 목록 보기' },
    { label: '기각', count: summaryResult.data.dismissedCount, href: '/admin/reports?status=dismissed', ariaLabel: '기각 신고 목록 보기' },
  ] : [];
  const memberCards: AdminMetric[] = operationalResult.kind === 'success' ? [
    { label: '전체 회원', count: operationalResult.data.totalMemberCount, href: '/admin/members', ariaLabel: '전체 회원 목록 보기' },
    { label: '정상 회원', count: operationalResult.data.activeMemberCount, href: '/admin/members?account=active', ariaLabel: '정상 회원 목록 보기' },
    { label: '정지 회원', count: operationalResult.data.suspendedMemberCount, href: '/admin/members?account=suspended', ariaLabel: '정지 회원 목록 보기' },
    { label: '숨김 프로필', count: operationalResult.data.hiddenProfileCount, href: '/admin/members?visibility=hidden', ariaLabel: '숨김 프로필 회원 목록 보기' },
    { label: '프로필 없음', count: operationalResult.data.missingProfileCount, href: '/admin/members?profile=missing', ariaLabel: '프로필 없는 회원 목록 보기' },
    { label: '프로필 작성 완료', count: operationalResult.data.completedProfileCount, href: '/admin/members?profile=completed', ariaLabel: '프로필 작성 완료 회원 목록 보기' },
  ] : [];
  const premiumCards: AdminMetric[] = [
    ...(premiumResult.kind === 'success' ? [{ label: '전체 Premium 회원', count: premiumResult.data.totalCount, href: '/admin/premium?status=exists', ariaLabel: '전체 Premium 회원 목록 보기' }] : []),
    ...(operationalResult.kind === 'success' ? [
    { label: 'Premium 이용 가능', count: operationalResult.data.premiumAvailableCount, href: '/admin/premium?status=available', ariaLabel: '이용 가능한 Premium 회원 목록 보기' },
    { label: 'Premium 시작 전', count: operationalResult.data.premiumNotStartedCount, href: '/admin/premium?status=not_started', ariaLabel: '시작 전 Premium 회원 목록 보기' },
    { label: 'Premium 만료', count: operationalResult.data.premiumExpiredCount, href: '/admin/premium?status=expired', ariaLabel: '만료된 Premium 회원 목록 보기' },
    { label: 'Premium 정지', count: operationalResult.data.premiumSuspendedCount, href: '/admin/premium?status=suspended', ariaLabel: '정지된 Premium 회원 목록 보기' },
    { label: 'Premium 회수', count: operationalResult.data.premiumRevokedCount, href: '/admin/premium?status=revoked', ariaLabel: '회수된 Premium 회원 목록 보기' },
    ] : []),
  ];
  const serviceStatisticsCards: AdminMetric[] = serviceStatisticsResult.kind === 'success' ? [
    { label: '전체 매칭', count: serviceStatisticsResult.data.totalMatchCount, countHref: '/admin/service-statistics?metric=total_matches', countAriaLabel: '전체 매칭 상세 내역 보기' },
    { label: '진행 중 매칭', count: serviceStatisticsResult.data.activeMatchCount, countHref: '/admin/service-statistics?metric=active_matches', countAriaLabel: '진행 중 매칭 상세 내역 보기' },
    { label: '종료 매칭', count: serviceStatisticsResult.data.endedMatchCount, countHref: '/admin/service-statistics?metric=ended_matches', countAriaLabel: '종료 매칭 상세 내역 보기' },
    { label: '전체 메시지', count: serviceStatisticsResult.data.totalMessageCount, countHref: '/admin/service-statistics?metric=total_messages', countAriaLabel: '전체 메시지 상세 내역 보기' },
    { label: '최근 7일 신규 회원', count: serviceStatisticsResult.data.newMemberLast7DaysCount, countHref: '/admin/service-statistics?metric=recent_members', countAriaLabel: '최근 7일 신규 회원 상세 내역 보기' },
    { label: '최근 7일 신고', count: serviceStatisticsResult.data.reportLast7DaysCount, countHref: '/admin/service-statistics?metric=recent_reports', countAriaLabel: '최근 7일 신고 상세 내역 보기' },
  ] : [];

  return <div className="space-y-8">
    <section><p className="text-sm font-bold text-green-700">{getAdminRoleLabel(adminAccess.role as AdminRole)}</p><h1 className="mt-2 text-3xl font-black text-gray-900">관리자 대시보드</h1><p className="mt-3 text-gray-600">신고, Premium, 회원 및 서비스 운영 현황을 확인하는 화면입니다.</p></section>

    {canViewSupportInquiries ? (
      pendingInquiryResult?.kind === 'success' ? (
        <Link
          href="/admin/inquiries?status=pending"
          aria-label={pendingInquiryResult.data.totalCount > 0 ? `새 문의 ${pendingInquiryResult.data.totalCount}건 보기` : '답변 대기 문의 보기'}
          className={`group flex items-center gap-4 rounded-2xl border p-5 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
            pendingInquiryResult.data.totalCount > 0
              ? 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100'
              : 'border-gray-200 bg-white hover:border-green-200 hover:bg-green-50'
          }`}
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${pendingInquiryResult.data.totalCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
            <MessagesSquare size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-black text-gray-900">
              1:1 문의
              {pendingInquiryResult.data.totalCount > 0 ? (
                <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-amber-600 px-2 text-xs font-black text-white">
                  {pendingInquiryResult.data.totalCount}
                </span>
              ) : null}
            </span>
            <span className={`mt-1 block text-sm font-semibold ${pendingInquiryResult.data.totalCount > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
              {pendingInquiryResult.data.totalCount > 0 ? `새 문의 ${pendingInquiryResult.data.totalCount}건` : '답변 대기 문의가 없습니다'}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition group-hover:text-green-700" aria-hidden="true" />
        </Link>
      ) : (
        <ErrorBox message={pendingInquiryResult?.kind === 'forbidden' ? '1:1 문의 조회 권한이 없습니다.' : '1:1 문의 현황을 불러오지 못했습니다.'} />
      )
    ) : null}

    <AdminDashboardSection headingId="service-statistics-heading" title="서비스 통계" description="현재 저장된 매칭·메시지와 최근 7일의 신규 회원·신고 현황을 확인합니다.">
      {serviceStatisticsResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{serviceStatisticsCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={serviceStatisticsResult.kind === 'forbidden' ? '서비스 통계 조회 권한이 없습니다.' : '서비스 통계를 불러오지 못했습니다.'} />}
    </AdminDashboardSection>

    <AdminDashboardSection headingId="member-management-heading" title="회원 관리" description="회원 계정과 프로필 상태를 확인합니다." viewAllHref={adminAccess.permissions.includes('member_restrictions_view') ? '/admin/members' : undefined} viewAllLabel="회원 관리 전체 보기">{operationalResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{memberCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={operationalResult.kind === 'forbidden' ? '운영 통계 조회 권한이 없습니다.' : '운영 통계를 불러오지 못했습니다.'} />}</AdminDashboardSection>

    <AdminDashboardSection headingId="premium-management-heading" title="Premium 관리" description="Premium 멤버십 행이 존재하는 전체 회원을 확인합니다." viewAllHref={adminAccess.permissions.includes('premium_memberships_view') ? '/admin/premium' : undefined} viewAllLabel="Premium 관리 전체 보기">
      {premiumCards.length > 0 ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{premiumCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : null}
      {operationalResult.kind !== 'success' ? <ErrorBox message={operationalResult.kind === 'forbidden' ? '운영 통계 조회 권한이 없습니다.' : '운영 통계를 불러오지 못했습니다.'} /> : null}
    </AdminDashboardSection>

    <AdminDashboardSection headingId="report-management-heading" title="신고 관리" description="신고 상태별 현황을 확인합니다." viewAllHref={adminAccess.permissions.includes('reports_view') ? '/admin/reports' : undefined} viewAllLabel="신고 관리 전체 보기">
      {summaryResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{summaryCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={summaryResult.kind === 'forbidden' ? '신고 조회 권한이 없습니다.' : '신고 현황을 불러오지 못했습니다.'} />}
    </AdminDashboardSection>
  </div>;
}
