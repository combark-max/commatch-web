import Link from 'next/link';
import { BellRing, ChevronRight } from 'lucide-react';
import Footer from '@/components/common/Footer';
import { parsePublicNoticeList } from '@/lib/support/notices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});

export default async function NoticesPage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_public_notices');
  const notices = error ? null : parsePublicNoticeList(data);

  return (
    <>
      <div className="bg-gray-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <header className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-700">
              <BellRing size={24} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">공지사항</h1>
            <p className="mt-3 leading-7 text-gray-600">ComMatch의 새로운 소식과 서비스 안내를 확인하세요.</p>
          </header>

          <section className="mt-8" aria-label="공지사항 목록">
            {notices === null ? (
              <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-sm font-semibold text-red-700">
                공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : notices.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center text-sm font-semibold text-gray-500 shadow-sm">
                게시된 공지사항이 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {notices.map((notice, index) => (
                  <Link
                    key={notice.noticeId}
                    href={`/notices/${notice.noticeId}`}
                    className="group flex min-h-24 items-center gap-4 border-b border-gray-100 px-5 py-5 transition last:border-b-0 hover:bg-green-50/60 sm:px-6"
                  >
                    {index === 0 ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-black text-green-800">최신</span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold text-gray-900 group-hover:text-green-800">{notice.title}</span>
                      <time dateTime={notice.publishedAt} className="mt-2 block text-sm text-gray-500">
                        {dateFormatter.format(new Date(notice.publishedAt))}
                      </time>
                    </span>
                    <ChevronRight className="shrink-0 text-gray-300 group-hover:text-green-600" size={20} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
