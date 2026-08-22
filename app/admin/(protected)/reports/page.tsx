import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import AdminRecentRestrictions from '@/components/admin/reports/AdminRecentRestrictions';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getReportStatusClassName,
  isReportStatus,
  isReportTargetType,
  parseAdminReportList,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type ReportStatus,
  type ReportTargetType,
} from '@/lib/admin/reports';
import {
  parseRecentMemberRestrictionActions,
  type RecentActivityResult,
  type RecentMemberRestrictionAction,
} from '@/lib/admin/recent-admin-activities';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ReportsSearchParams = {
  status?: string | string[];
  type?: string | string[];
  page?: string | string[];
};

const PAGE_SIZE = 10;
const listDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Seoul',
});

const firstValue = (value: string | string[] | undefined): string | undefined => (
  Array.isArray(value) ? value[0] : value
);

const normalizePage = (value: string | undefined): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
};

const buildListHref = (status: ReportStatus | null, type: ReportTargetType | null, page: number) => {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (type) query.set('type', type);
  if (page > 1) query.set('page', String(page));
  const value = query.toString();
  return value ? `/admin/reports?${value}` : '/admin/reports';
};

const MemberLink = ({
  userId,
  nickname,
  memberExists,
  profileExists,
}: {
  userId: string;
  nickname: string | null;
  memberExists: boolean;
  profileExists: boolean;
}) => memberExists ? (
  <Link
    href={`/admin/members/${userId}`}
    aria-label={`${nickname ?? '프로필 정보 없음'} 관리자 회원 상세 보기`}
    className="font-semibold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
  >
    {profileExists && nickname ? nickname : '프로필 정보 없음'}
  </Link>
) : <span className="font-semibold text-gray-600">탈퇴한 회원</span>;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportsSearchParams>;
}) {
  await requireAdminAccess('reports_view');
  const query = await searchParams;
  const rawStatus = firstValue(query.status);
  const rawType = firstValue(query.type);
  const status = isReportStatus(rawStatus) ? rawStatus : null;
  const targetType = isReportTargetType(rawType) ? rawType : null;
  const page = normalizePage(firstValue(query.page));

  const supabase = await createServerSupabaseClient();
  const [listResult, recentRestrictionsRpc] = await Promise.all([
    supabase.rpc('get_admin_reports', {
      status_filter: status,
      target_type_filter: targetType,
      page_number: page,
      page_size: PAGE_SIZE,
    }),
    supabase.rpc('get_admin_recent_member_restriction_actions', { p_limit: 5 }),
  ]);
  const { data, error } = listResult;
  const reports = error ? null : parseAdminReportList(data);
  const parsedRestrictions = recentRestrictionsRpc.error
    ? null : parseRecentMemberRestrictionActions(recentRestrictionsRpc.data);
  const recentRestrictions: RecentActivityResult<RecentMemberRestrictionAction[]> = recentRestrictionsRpc.error
    ? { kind: recentRestrictionsRpc.error.code === '42501' ? 'forbidden' : 'rpc_error' }
    : parsedRestrictions === null ? { kind: 'parse_error' } : { kind: 'success', data: parsedRestrictions };
  const totalCount = reports?.[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters = status !== null || targetType !== null;
  const detailQuery = new URLSearchParams();
  if (status) detailQuery.set('status', status);
  if (targetType) detailQuery.set('type', targetType);
  if (page > 1) detailQuery.set('page', String(page));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-gray-900">신고 관리</h1>
        <p className="mt-3 text-gray-600">조건에 맞는 신고 {totalCount.toLocaleString('ko-KR')}건</p>
      </section>

      <form key={`${status ?? 'all'}:${targetType ?? 'all'}`} method="get" action="/admin/reports" className="grid gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end sm:p-6">
        <div>
          <label htmlFor="report-status-filter" className="mb-2 block text-sm font-semibold text-gray-700">상태</label>
          <select id="report-status-filter" name="status" defaultValue={status ?? ''} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="">전체</option>
            <option value="pending">접수 대기</option>
            <option value="reviewing">검토 중</option>
            <option value="resolved">처리 완료</option>
            <option value="dismissed">기각</option>
          </select>
        </div>
        <div>
          <label htmlFor="report-type-filter" className="mb-2 block text-sm font-semibold text-gray-700">신고 대상</label>
          <select id="report-type-filter" name="type" defaultValue={targetType ?? ''} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="">전체</option>
            <option value="profile">회원 프로필</option>
            <option value="message">채팅 메시지</option>
          </select>
        </div>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700">
          <Search size={16} aria-hidden="true" /> 조회
        </button>
        <Link href="/admin/reports" className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-gray-300 px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
          <RotateCcw size={16} aria-hidden="true" /> 초기화
        </Link>
      </form>

      {reports === null ? (
        <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div>
              <p className="font-semibold">신고 목록을 불러오지 못했습니다.</p>
              <a href={buildListHref(status, targetType, page)} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a>
            </div>
          </div>
        </section>
      ) : reports.length === 0 ? (
        <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">
            {hasFilters ? '조건에 맞는 신고가 없습니다.' : '접수된 신고가 없습니다.'}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="w-24 whitespace-nowrap px-5 py-3 font-semibold">신고 ID</th>
                  {['접수일', '대상', '신고 사유', '신고자', '신고 대상', '상태', '상세'].map((label) => (
                    <th key={label} scope="col" className="px-5 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report) => {
                  const suffix = detailQuery.toString();
                  const detailHref = `/admin/reports/${report.reportId}${suffix ? `?${suffix}` : ''}`;
                  return (
                    <tr key={report.reportId} className="hover:bg-gray-50/70">
                      <td className="w-24 whitespace-nowrap px-5 py-4 font-mono text-xs">
                        <Link href={detailHref} className="font-bold text-green-700 hover:text-green-800">{report.reportId.slice(0, 8)}</Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{listDateFormatter.format(new Date(report.createdAt))}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900">{REPORT_TARGET_LABELS[report.targetType]}</td>
                      <td className="px-5 py-4 text-gray-700">{REPORT_REASON_LABELS[report.reason]}</td>
                      <td className="px-5 py-4 text-gray-700">
                        <MemberLink
                          userId={report.reporterUserId}
                          nickname={report.reporterNickname}
                          memberExists={report.reporterMemberExists}
                          profileExists={report.reporterProfileExists}
                        />
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        <MemberLink
                          userId={report.reportedUserId}
                          nickname={report.reportedNickname}
                          memberExists={report.reportedMemberExists}
                          profileExists={report.reportedProfileExists}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getReportStatusClassName(report.status)}`}>{REPORT_STATUS_LABELS[report.status]}</span>
                      </td>
                      <td className="px-5 py-4">
                        <Link href={detailHref} className="font-bold text-green-700 hover:text-green-800">상세 보기</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {reports !== null && totalPages > 1 ? (
        <nav aria-label="신고 목록 페이지" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={buildListHref(status, targetType, page - 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} />이전</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} />이전</span>
          )}
          <span className="text-sm font-semibold text-gray-700">{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={buildListHref(status, targetType, page + 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} /></Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} /></span>
          )}
        </nav>
      ) : null}

      <AdminRecentRestrictions result={recentRestrictions} />
    </div>
  );
}
