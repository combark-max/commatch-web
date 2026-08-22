'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ClipboardList,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  parseReportHistory,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type ReportHistoryItem,
  type ReportHistoryStatus,
} from '@/lib/reports/history';
import { createClient } from '@/lib/supabase/client';

type PageState = 'loading' | 'ready' | 'error';

const reportDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const statusClasses: Record<ReportHistoryStatus, string> = {
  pending: 'bg-blue-50 text-blue-700',
  reviewing: 'bg-amber-50 text-amber-700',
  resolved: 'bg-green-50 text-green-700',
  dismissed: 'bg-gray-100 text-gray-600',
};

export default function ReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [reports, setReports] = useState<ReportHistoryItem[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      setPageState('loading');

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          router.replace('/login');
          return;
        }

        const { data, error } = await supabase.rpc('get_my_reports');
        if (error) throw error;

        const parsedReports = parseReportHistory(data);
        if (isMounted) {
          setReports(parsedReports);
          setPageState('ready');
        }
      } catch (error) {
        console.error('신고 내역을 불러오지 못했습니다.', error);
        if (isMounted) setPageState('error');
      }
    };

    void loadReports();
    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <p className="font-medium text-gray-500">신고 내역을 불러오는 중...</p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">신고 내역을 불러오지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-7 min-h-12 rounded-2xl px-6 text-sm" onClick={() => setRetryKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
        >
          <ArrowLeft size={19} /> 마이페이지로 돌아가기
        </Link>

        <header className="mt-6 rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <ClipboardList size={25} />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">내 신고내역</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">내가 접수한 신고와 현재 처리 상태를 확인할 수 있습니다.</p>
            </div>
          </div>
        </header>

        {reports.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-14">
            <ShieldCheck className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-5 text-xl font-bold text-gray-800">접수한 신고가 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">회원 또는 채팅 메시지를 신고하면 처리 상태를 이곳에서 확인할 수 있습니다.</p>
          </section>
        ) : (
          <section className="mt-8 space-y-4" aria-label="내 신고 목록">
            {reports.map((report) => (
              <article key={report.reportId} className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      {REPORT_TARGET_LABELS[report.targetType]}
                    </p>
                    <h2 className="mt-1 text-lg font-extrabold text-gray-900">{report.targetDisplayName}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusClasses[report.status]}`}>
                    {REPORT_STATUS_LABELS[report.status]}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 border-t border-gray-100 pt-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-gray-500">신고 접수일</dt>
                    <dd className="mt-1 font-medium text-gray-800">
                      <time dateTime={report.createdAt}>{reportDateFormatter.format(new Date(report.createdAt))}</time>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">신고 사유</dt>
                    <dd className="mt-1 font-medium text-gray-800">
                      {REPORT_REASON_LABELS[report.reasonCode] ?? '기타'}
                    </dd>
                  </div>
                  {report.completedAt ? (
                    <div>
                      <dt className="font-semibold text-gray-500">처리 완료 시각</dt>
                      <dd className="mt-1 font-medium text-gray-800">
                        <time dateTime={report.completedAt}>{reportDateFormatter.format(new Date(report.completedAt))}</time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {report.reasonDetail ? (
                  <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs font-bold text-gray-500">상세 사유</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{report.reasonDetail}</p>
                  </div>
                ) : null}

                {report.status === 'resolved' || report.status === 'dismissed' ? (
                  <div className="mt-5 rounded-2xl bg-green-50 p-4">
                    <p className="text-xs font-bold text-green-700">처리 결과</p>
                    <p className="mt-2 text-sm leading-6 text-green-900">
                      {report.status === 'resolved'
                        ? '신고 검토가 완료되었습니다.'
                        : '신고 검토 후 종결되었습니다.'}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
