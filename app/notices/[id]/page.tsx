import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/common/Footer';
import { isUuid, parsePublicNoticeDetail } from '@/lib/support/notices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_public_notice', { p_notice_id: id });
  if (error) {
    return (
      <div className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
        <div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-sm font-semibold text-red-700">
          공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      </div>
    );
  }

  const notice = parsePublicNoticeDetail(data);
  if (!notice) notFound();

  return (
    <>
      <div className="bg-gray-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <article className="mx-auto max-w-4xl rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
          <Link href="/notices" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-green-50 hover:text-green-700">
            <ArrowLeft size={18} aria-hidden="true" /> 목록으로 돌아가기
          </Link>
          <header className="mt-7 border-b border-gray-100 pb-7">
            <h1 className="break-words text-3xl font-black tracking-tight text-gray-900">{notice.title}</h1>
            <time dateTime={notice.publishedAt} className="mt-3 block text-sm text-gray-500">
              {dateFormatter.format(new Date(notice.publishedAt))}
            </time>
          </header>
          <div className="whitespace-pre-wrap break-words py-8 text-[15px] leading-8 text-gray-700">{notice.body}</div>
        </article>
      </div>
      <Footer />
    </>
  );
}
