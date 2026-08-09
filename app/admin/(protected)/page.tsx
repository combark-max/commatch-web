import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import AdminPagination from '@/components/admin/AdminPagination';
import AdminDashboardSection from '@/components/admin/dashboard/AdminDashboardSection';
import AdminMetricCard, { type AdminMetric } from '@/components/admin/dashboard/AdminMetricCard';
import { requireAdminAccess, type AdminRole } from '@/lib/admin/access';
import { MEMBER_ACCOUNT_STATUS_LABELS, MEMBER_PROFILE_VISIBILITY_LABELS } from '@/lib/admin/member-restrictions';
import {
  getPremiumPeriodState,
  getPremiumPeriodStateClassName,
  getPremiumStatusClassName,
  parseAdminPremiumMembershipList,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_PERIOD_STATE_LABELS,
  PREMIUM_STATUS_LABELS,
  type AdminPremiumMembershipListItem,
} from '@/lib/admin/premium-memberships';
import {
  getReportStatusClassName,
  parseAdminReportList,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type AdminReportListItem,
} from '@/lib/admin/reports';
import {
  parseAdminServiceStatistics,
  type AdminServiceStatistics,
} from '@/lib/admin/service-statistics';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DashboardSearchParams = {
  reportPage?: string | string[];
  premiumPage?: string | string[];
  [key: string]: string | string[] | undefined;
};
type ReportSummary = { totalCount: string; pendingCount: string; reviewingCount: string; resolvedCount: string; dismissedCount: string };
type OperationalSummary = {
  totalMemberCount: number; activeMemberCount: number; suspendedMemberCount: number;
  hiddenProfileCount: number; missingProfileCount: number; completedProfileCount: number;
  premiumAvailableCount: number; premiumNotStartedCount: number; premiumExpiredCount: number;
  premiumSuspendedCount: number; premiumRevokedCount: number; premiumExpiringSoonCount: number;
  expirationWindowDays: number;
};
type DataResult<T> = { kind: 'success'; data: T } | { kind: 'forbidden' | 'error' };
type PagedResult<T> = DataResult<{ items: T[]; totalCount: number; currentPage: number; totalPages: number }>;

const PAGE_SIZE = 10;
const MAX_PAGE = Math.floor(2_147_483_647 / PAGE_SIZE) + 1;
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Seoul',
});
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const normalizePage = (value: string | undefined) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
};
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
async function loadReportPage(requestedPage: number): Promise<PagedResult<AdminReportListItem>> {
  const client = await createServerSupabaseClient();
  const fetchPage = async (page: number) => {
    const result = await client.rpc('get_admin_reports', { status_filter: null, target_type_filter: null, page_number: page, page_size: PAGE_SIZE });
    return { error: result.error, items: result.error ? null : parseAdminReportList(result.data) };
  };
  let currentPage = requestedPage;
  let result = await fetchPage(currentPage);
  if (result.error) return { kind: errorKind(result.error) };
  if (!result.items) return { kind: 'error' };
  if (result.items.length === 0 && currentPage > 1) {
    const first = await fetchPage(1);
    if (first.error) return { kind: errorKind(first.error) };
    if (!first.items) return { kind: 'error' };
    const total = first.items[0]?.totalCount ?? 0;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = lastPage;
    result = lastPage === 1 ? first : await fetchPage(lastPage);
    if (result.error) return { kind: errorKind(result.error) };
    if (!result.items) return { kind: 'error' };
  }
  const totalCount = result.items[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  return { kind: 'success', data: { items: result.items, totalCount, currentPage, totalPages } };
}
async function loadPremiumPage(requestedPage: number): Promise<PagedResult<AdminPremiumMembershipListItem>> {
  const client = await createServerSupabaseClient();
  const fetchPage = async (page: number) => {
    const result = await client.rpc('get_admin_premium_memberships', {
      p_search: null, p_status: 'exists', p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      p_sort_key: 'updated_at', p_sort_direction: 'desc',
    });
    return { error: result.error, items: result.error ? null : parseAdminPremiumMembershipList(result.data) };
  };
  let currentPage = requestedPage;
  let result = await fetchPage(currentPage);
  if (result.error) return { kind: errorKind(result.error) };
  if (!result.items) return { kind: 'error' };
  if (result.items.length === 0 && currentPage > 1) {
    const first = await fetchPage(1);
    if (first.error) return { kind: errorKind(first.error) };
    if (!first.items) return { kind: 'error' };
    const total = first.items[0]?.totalCount ?? 0;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = lastPage;
    result = lastPage === 1 ? first : await fetchPage(lastPage);
    if (result.error) return { kind: errorKind(result.error) };
    if (!result.items) return { kind: 'error' };
  }
  const totalCount = result.items[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return { kind: 'success', data: { items: result.items, totalCount, currentPage, totalPages } };
}

const ErrorBox = ({ message, href = '/admin' }: { message: string; href?: string }) => <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div><p className="font-semibold">{message}</p><a href={href} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a></div></div></div>;
const MemberLink = ({ userId, nickname, memberExists, profileExists }: { userId: string; nickname: string | null; memberExists: boolean; profileExists: boolean }) => memberExists ? <Link href={`/admin/members/${userId}`} className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">{profileExists && nickname ? nickname : '프로필 정보 없음'}</Link> : <span className="font-bold text-gray-600">탈퇴한 회원</span>;

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');
  const query = await searchParams;
  const reportPage = normalizePage(firstValue(query.reportPage));
  const premiumPage = normalizePage(firstValue(query.premiumPage));
  const [summaryResult, operationalResult, reportResult, premiumResult, serviceStatisticsResult] = await Promise.all([
    loadReportSummary(), loadOperationalSummary(), loadReportPage(reportPage), loadPremiumPage(premiumPage),
    loadServiceStatistics(),
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
    ...(premiumResult.kind === 'success' ? [{ label: '실제 Premium 등록', count: premiumResult.data.totalCount, href: '/admin/premium?status=exists', ariaLabel: '실제 Premium 등록 회원 목록 보기' }] : []),
    ...(operationalResult.kind === 'success' ? [
    { label: 'Premium 이용 가능', count: operationalResult.data.premiumAvailableCount, href: '/admin/premium?status=available', ariaLabel: '이용 가능한 Premium 회원 목록 보기' },
    { label: 'Premium 시작 전', count: operationalResult.data.premiumNotStartedCount, href: '/admin/premium?status=not_started', ariaLabel: '시작 전 Premium 회원 목록 보기' },
    { label: 'Premium 만료', count: operationalResult.data.premiumExpiredCount, href: '/admin/premium?status=expired', ariaLabel: '만료된 Premium 회원 목록 보기' },
    { label: 'Premium 정지', count: operationalResult.data.premiumSuspendedCount, href: '/admin/premium?status=suspended', ariaLabel: '정지된 Premium 회원 목록 보기' },
    { label: 'Premium 회수', count: operationalResult.data.premiumRevokedCount, href: '/admin/premium?status=revoked', ariaLabel: '회수된 Premium 회원 목록 보기' },
    ] : []),
  ];
  const serviceStatisticsCards: AdminMetric[] = serviceStatisticsResult.kind === 'success' ? [
    { label: '전체 매칭', count: serviceStatisticsResult.data.totalMatchCount },
    { label: '진행 중 매칭', count: serviceStatisticsResult.data.activeMatchCount },
    { label: '종료 매칭', count: serviceStatisticsResult.data.endedMatchCount },
    { label: '전체 메시지', count: serviceStatisticsResult.data.totalMessageCount },
    { label: '최근 7일 신규 회원', count: serviceStatisticsResult.data.newMemberLast7DaysCount },
    { label: '최근 7일 신고', count: serviceStatisticsResult.data.reportLast7DaysCount },
  ] : [];

  return <div className="space-y-8">
    <section><p className="text-sm font-bold text-green-700">{getAdminRoleLabel(adminAccess.role as AdminRole)}</p><h1 className="mt-2 text-3xl font-black text-gray-900">관리자 대시보드</h1><p className="mt-3 text-gray-600">신고, Premium, 회원 및 서비스 운영 현황을 확인하는 화면입니다.</p></section>

    <AdminDashboardSection headingId="report-management-heading" title="신고 관리" description="최근 접수된 신고를 최신순으로 확인합니다." viewAllHref={adminAccess.permissions.includes('reports_view') ? '/admin/reports' : undefined} viewAllLabel="신고 관리 전체 보기">
      {summaryResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{summaryCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={summaryResult.kind === 'forbidden' ? '신고 조회 권한이 없습니다.' : '신고 현황을 불러오지 못했습니다.'} />}
      {reportResult.kind === 'success' ? <section aria-labelledby="dashboard-reports-heading" className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-5 sm:px-6"><h3 id="dashboard-reports-heading" className="text-lg font-black text-gray-900">최근 신고</h3><p className="mt-1 text-sm text-gray-500">총 {reportResult.data.totalCount.toLocaleString('ko-KR')}건 · {reportResult.data.currentPage} / {reportResult.data.totalPages}페이지</p></div>
        {reportResult.data.items.length === 0 ? <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">접수된 신고가 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{['상태', '대상', '신고 사유', '신고자', '신고 대상', '접수 시각', '상세'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{reportResult.data.items.map((report) => <tr key={report.reportId}><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getReportStatusClassName(report.status)}`}>{REPORT_STATUS_LABELS[report.status]}</span></td><td className="px-4 py-4 font-semibold text-gray-900">{REPORT_TARGET_LABELS[report.targetType]}</td><td className="px-4 py-4 text-gray-700">{REPORT_REASON_LABELS[report.reason]}</td><td className="px-4 py-4"><MemberLink userId={report.reporterUserId} nickname={report.reporterNickname} memberExists={report.reporterMemberExists} profileExists={report.reporterProfileExists} /></td><td className="px-4 py-4"><MemberLink userId={report.reportedUserId} nickname={report.reportedNickname} memberExists={report.reportedMemberExists} profileExists={report.reportedProfileExists} /></td><td className="whitespace-nowrap px-4 py-4 text-gray-600"><time dateTime={report.createdAt}>{dateFormatter.format(new Date(report.createdAt))}</time></td><td className="px-4 py-4"><Link href={`/admin/reports/${report.reportId}`} className="font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">상세 보기</Link></td></tr>)}</tbody></table></div>}
        <div className="border-t border-gray-100 px-3 py-4"><AdminPagination pathname="/admin" pageParam="reportPage" currentPage={reportResult.data.currentPage} totalPages={reportResult.data.totalPages} searchParams={query} ariaLabel="대시보드 신고 목록 페이지" /></div>
      </section> : <ErrorBox message={reportResult.kind === 'forbidden' ? '신고 목록 조회 권한이 없습니다.' : '신고 목록을 불러오지 못했습니다.'} />}
    </AdminDashboardSection>

    <AdminDashboardSection headingId="premium-management-heading" title="Premium 관리" description="Premium 멤버십 행이 존재하는 전체 회원을 확인합니다." viewAllHref={adminAccess.permissions.includes('premium_memberships_view') ? '/admin/premium' : undefined} viewAllLabel="Premium 관리 전체 보기">
      {premiumCards.length > 0 ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{premiumCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : null}
      {operationalResult.kind !== 'success' ? <ErrorBox message={operationalResult.kind === 'forbidden' ? '운영 통계 조회 권한이 없습니다.' : '운영 통계를 불러오지 못했습니다.'} /> : null}
      {premiumResult.kind === 'success' ? <section aria-labelledby="dashboard-premium-heading" className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-100 px-5 py-5 sm:px-6"><h3 id="dashboard-premium-heading" className="text-lg font-black text-gray-900">전체 Premium 회원 현황</h3><p className="mt-1 text-sm text-gray-500">총 {premiumResult.data.totalCount.toLocaleString('ko-KR')}명 · {premiumResult.data.currentPage} / {premiumResult.data.totalPages}페이지</p></div>
        {premiumResult.data.items.length === 0 ? <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">Premium 회원이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1350px] text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{['회원', '짧은 UUID', '저장 상태', '기간 상태', '현재 이용', '시작일', '만료일', '기능 권한', '프로필 상태', '최근 변경', '관리'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{premiumResult.data.items.map((membership) => { const status = membership.storedStatus ?? 'none'; const period = getPremiumPeriodState(membership); return <tr key={membership.memberUserId}><td className="px-4 py-4"><Link href={`/admin/members/${membership.memberUserId}`} className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">{membership.profileExists && membership.nickname ? membership.nickname : '프로필 정보 없음'}</Link></td><td className="px-4 py-4 font-mono text-xs text-gray-500">{membership.memberUserId.slice(0, 8)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumStatusClassName(status)}`}>{PREMIUM_STATUS_LABELS[status]}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumPeriodStateClassName(period)}`}>{PREMIUM_PERIOD_STATE_LABELS[period]}</span></td><td className="px-4 py-4 font-semibold text-gray-700">{membership.isAvailable ? '가능' : '불가'}</td><td className="whitespace-nowrap px-4 py-4 text-gray-600">{membership.startedAt ? dateFormatter.format(new Date(membership.startedAt)) : '해당 없음'}</td><td className="whitespace-nowrap px-4 py-4 text-gray-600">{membership.expiresAt ? dateFormatter.format(new Date(membership.expiresAt)) : '무기한'}</td><td className="px-4 py-4 text-gray-700">{membership.featureKeys.map((key) => PREMIUM_FEATURE_LABELS[key]).join(', ') || '해당 없음'}</td><td className="px-4 py-4 text-gray-700">{membership.profileExists ? MEMBER_PROFILE_VISIBILITY_LABELS[membership.profileVisibility] : '프로필 없음'} · {MEMBER_ACCOUNT_STATUS_LABELS[membership.accountStatus]}</td><td className="whitespace-nowrap px-4 py-4 text-gray-600">{membership.membershipUpdatedAt ? dateFormatter.format(new Date(membership.membershipUpdatedAt)) : '해당 없음'}</td><td className="px-4 py-4"><Link href={`/admin/premium/${membership.memberUserId}`} className="font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">Premium 상세</Link></td></tr>; })}</tbody></table></div>}
        <div className="border-t border-gray-100 px-3 py-4"><AdminPagination pathname="/admin" pageParam="premiumPage" currentPage={premiumResult.data.currentPage} totalPages={premiumResult.data.totalPages} searchParams={query} ariaLabel="대시보드 Premium 회원 목록 페이지" /></div>
      </section> : <ErrorBox message={premiumResult.kind === 'forbidden' ? 'Premium 회원 조회 권한이 없습니다.' : 'Premium 회원 목록을 불러오지 못했습니다.'} />}
    </AdminDashboardSection>

    <AdminDashboardSection headingId="member-management-heading" title="회원 관리" description="회원 계정과 프로필 상태를 확인합니다." viewAllHref={adminAccess.permissions.includes('member_restrictions_view') ? '/admin/members' : undefined} viewAllLabel="회원 관리 전체 보기">{operationalResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{memberCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={operationalResult.kind === 'forbidden' ? '운영 통계 조회 권한이 없습니다.' : '운영 통계를 불러오지 못했습니다.'} />}</AdminDashboardSection>
    <AdminDashboardSection headingId="service-statistics-heading" title="서비스 통계" description="현재 저장된 매칭·메시지와 최근 7일의 신규 회원·신고 현황을 확인합니다.">
      {serviceStatisticsResult.kind === 'success' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{serviceStatisticsCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}</div> : <ErrorBox message={serviceStatisticsResult.kind === 'forbidden' ? '서비스 통계 조회 권한이 없습니다.' : '서비스 통계를 불러오지 못했습니다.'} />}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center"><p className="mt-3 text-sm font-semibold text-gray-600">상세 통계 화면 준비 중</p></div>
    </AdminDashboardSection>
    {adminAccess.permissions.includes('admin_accounts_manage') ? <AdminDashboardSection headingId="admin-account-management-heading" title="관리자 계정 관리" description="관리자 역할과 계정 상태를 관리합니다." viewAllHref="/admin/admins" viewAllLabel="관리자 계정 관리 전체 보기"><div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-8 text-center"><p className="text-sm font-semibold text-green-900">관리자 계정 목록에서 역할과 상태를 안전하게 관리할 수 있습니다.</p><p className="mt-1 text-xs text-green-700">활성 super_admin 전용 기능입니다.</p></div></AdminDashboardSection> : null}
  </div>;
}
