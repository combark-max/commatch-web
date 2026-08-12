import Link from 'next/link';
import { AlertCircle, FilePlus2 } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getNoticeStatusClassName,
  NOTICE_STATUS_LABELS,
  parseAdminNoticeList,
} from '@/lib/support/notices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

export default async function AdminNoticesPage() {
  await requireAdminAccess('notices_manage');
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_notices');
  const notices = error ? null : parseAdminNoticeList(data);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">공지사항 관리</h1>
          <p className="mt-3 text-gray-600">공지를 작성하고 게시 상태를 관리합니다.</p>
        </div>
        <Link href="/admin/notices/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-green-600 px-5 text-sm font-bold text-white shadow-lg shadow-green-200 transition hover:bg-green-700">
          <FilePlus2 size={18} aria-hidden="true" /> 새 공지 작성
        </Link>
      </header>

      {notices === null ? (
        <section role="alert" className="flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
          <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div>
            <p className="font-semibold">공지 목록을 불러오지 못했습니다.</p>
            <Link href="/admin/notices" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</Link>
          </div>
        </section>
      ) : notices.length === 0 ? (
        <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">작성된 공지사항이 없습니다.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {['제목', '상태', '게시일', '최근 수정', '관리'].map((label) => (
                    <th key={label} scope="col" className="px-5 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notices.map((notice) => (
                  <tr key={notice.noticeId} className="hover:bg-gray-50/70">
                    <td className="max-w-md break-words px-5 py-4 font-bold text-gray-900">{notice.title}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getNoticeStatusClassName(notice.status)}`}>
                        {NOTICE_STATUS_LABELS[notice.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                      {notice.publishedAt ? dateFormatter.format(new Date(notice.publishedAt)) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-600">{dateFormatter.format(new Date(notice.updatedAt))}</td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/notices/${notice.noticeId}`} className="font-bold text-green-700 hover:text-green-800">상세 관리</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
