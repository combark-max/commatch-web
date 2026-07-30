import Link from 'next/link';
import { AlertCircle, ArrowRight, FileWarning } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
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

type ReportDataResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'forbidden' }
  | { kind: 'error' };

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

export default async function AdminDashboardPage() {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');
  const [summaryResult, recentReportsResult] = await Promise.all([
    loadReportSummary(),
    loadRecentReports(),
  ]);

  const summaryCards = summaryResult.kind === 'success'
    ? [
        ['전체 신고', summaryResult.data.totalCount],
        ['접수 대기', summaryResult.data.pendingCount],
        ['검토 중', summaryResult.data.reviewingCount],
        ['처리 완료', summaryResult.data.resolvedCount],
        ['기각', summaryResult.data.dismissedCount],
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
            {summaryCards.map(([label, count]) => (
              <article key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-500">{label}</p>
                <p className="mt-3 text-3xl font-black text-gray-900">{count}</p>
              </article>
            ))}
          </div>
        ) : (
          <ReportError forbidden={summaryResult.kind === 'forbidden'} />
        )}
      </section>

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
                      <td className="px-6 py-4 font-semibold text-gray-900">{getTargetLabel(report.targetType)}</td>
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
