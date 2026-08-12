import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  changeAdminNoticeStatusAction,
  updateAdminNoticeAction,
} from '@/app/admin/(protected)/notices/actions';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getNoticeStatusClassName,
  isUuid,
  NOTICE_STATUS_LABELS,
  parseAdminNoticeDetail,
} from '@/lib/support/notices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

const RESULT_MESSAGES: Record<string, string> = {
  created: '새 공지를 작성 중 상태로 저장했습니다.',
  updated: '공지 내용을 수정했습니다.',
  draft: '공개를 중단하고 작성 중 상태로 전환했습니다.',
  published: '공지를 게시했습니다.',
  archived: '공지를 보관 처리했습니다.',
};

const ERROR_MESSAGES: Record<string, string> = {
  validation: '입력 내용 또는 상태 변경 요청을 확인해 주세요.',
  stale: '다른 관리자가 먼저 공지를 변경했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.',
  'not-found': '공지사항을 찾을 수 없습니다.',
  forbidden: '공지사항을 관리할 권한이 없습니다.',
  'save-failed': '변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export default async function AdminNoticeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string | string[]; error?: string | string[] }>;
}) {
  await requireAdminAccess('notices_manage');
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_notice', { p_notice_id: id });
  if (error) {
    return <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">공지사항을 불러오지 못했습니다.</p>;
  }
  const notice = parseAdminNoticeDetail(data);
  if (!notice) notFound();

  const query = await searchParams;
  const resultKey = Array.isArray(query.result) ? query.result[0] : query.result;
  const errorKey = Array.isArray(query.error) ? query.error[0] : query.error;
  const resultMessage = resultKey ? RESULT_MESSAGES[resultKey] : null;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null;
  const isArchived = notice.status === 'archived';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/notices" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900">
          <ArrowLeft size={18} aria-hidden="true" /> 공지 목록으로 돌아가기
        </Link>
        {notice.status === 'published' ? (
          <Link href={`/notices/${notice.noticeId}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-green-700 hover:bg-green-50">
            공개 화면 보기 <ExternalLink size={17} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">공지 상세 관리</h1>
          <p className="mt-3 text-sm text-gray-600">최근 수정 {dateTimeFormatter.format(new Date(notice.updatedAt))}</p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getNoticeStatusClassName(notice.status)}`}>{NOTICE_STATUS_LABELS[notice.status]}</span>
      </header>

      {resultMessage ? <p role="status" className="rounded-2xl bg-green-50 px-5 py-4 text-sm font-semibold text-green-800">{resultMessage}</p> : null}
      {errorMessage ? <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      {isArchived ? (
        <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="break-words text-2xl font-black text-gray-900">{notice.title}</h2>
          <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{notice.body}</p>
          <p className="mt-6 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">보관된 공지는 수정하거나 다시 게시할 수 없습니다.</p>
        </article>
      ) : (
        <form action={updateAdminNoticeAction} className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <input type="hidden" name="noticeId" value={notice.noticeId} />
          <input type="hidden" name="expectedUpdatedAt" value={notice.updatedAt} />
          <div>
            <label htmlFor="notice-title" className="mb-2 block text-sm font-bold text-gray-800">제목</label>
            <input id="notice-title" name="title" type="text" required maxLength={150} defaultValue={notice.title} className="h-12 w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" />
          </div>
          <div>
            <label htmlFor="notice-body" className="mb-2 block text-sm font-bold text-gray-800">본문</label>
            <textarea id="notice-body" name="body" required maxLength={10000} rows={16} defaultValue={notice.body} className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm leading-7 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" />
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-600 px-6 text-sm font-bold text-white transition hover:bg-green-700">내용 저장</button>
        </form>
      )}

      {!isArchived ? (
        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="notice-status-heading">
          <h2 id="notice-status-heading" className="text-xl font-black text-gray-900">게시 상태</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">내용을 먼저 저장한 뒤 상태를 변경하세요. 보관한 공지는 다시 복구할 수 없습니다.</p>
          <form action={changeAdminNoticeStatusAction} className="mt-5">
            <input type="hidden" name="noticeId" value={notice.noticeId} />
            <input type="hidden" name="expectedUpdatedAt" value={notice.updatedAt} />
            {notice.status === 'draft' ? (
              <button type="submit" name="newStatus" value="published" className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-600 px-5 text-sm font-bold text-white hover:bg-green-700">게시하기</button>
            ) : (
              <button type="submit" name="newStatus" value="draft" className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-amber-300 px-5 text-sm font-bold text-amber-800 hover:bg-amber-50">게시 중단</button>
            )}
          </form>
          <form action={changeAdminNoticeStatusAction} className="mt-6 border-t border-gray-100 pt-6">
            <input type="hidden" name="noticeId" value={notice.noticeId} />
            <input type="hidden" name="expectedUpdatedAt" value={notice.updatedAt} />
            <input type="hidden" name="newStatus" value="archived" />
            <label className="flex items-start gap-3 text-sm leading-6 text-gray-700">
              <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
              보관 후에는 공지를 수정하거나 다시 게시할 수 없음을 확인했습니다.
            </label>
            <button type="submit" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-gray-300 px-5 text-sm font-bold text-gray-700 hover:bg-gray-50">보관하기</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
