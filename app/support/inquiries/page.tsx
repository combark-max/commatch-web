import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, MessageSquarePlus, MessagesSquare } from 'lucide-react';
import {
  getSupportInquiryStatusClassName,
  parseMySupportInquiryList,
  SUPPORT_INQUIRY_CATEGORY_LABELS,
  SUPPORT_INQUIRY_STATUS_LABELS,
} from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Seoul',
});

export default async function SupportInquiriesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data, error } = await supabase.rpc('get_my_support_inquiries');
  const inquiries = error ? null : parseMySupportInquiryList(data);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700"><MessagesSquare size={25} /></span>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">1:1 문의</h1>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">서비스 이용 중 궁금한 점을 문의하고 관리자 답변을 확인할 수 있습니다.</p>
          </div>
          <Link href="/support/inquiries/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-green-600 px-5 text-sm font-bold text-white shadow-lg shadow-green-200 hover:bg-green-700">
            <MessageSquarePlus size={18} /> 새 문의 작성
          </Link>
        </header>

        {inquiries === null ? (
          <section role="alert" className="flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
            <AlertCircle className="mt-0.5 shrink-0" size={20} />
            <div><p className="font-semibold">문의 내역을 불러오지 못했습니다.</p><Link href="/support/inquiries" className="mt-2 inline-block text-sm font-semibold underline">다시 시도</Link></div>
          </section>
        ) : inquiries.length === 0 ? (
          <section className="rounded-[2rem] border border-gray-100 bg-white p-12 text-center shadow-sm">
            <MessagesSquare className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-5 text-xl font-bold text-gray-800">아직 접수한 문의가 없습니다.</h2>
            <p className="mt-2 text-sm text-gray-500">도움이 필요할 때 새 문의를 작성해 주세요.</p>
          </section>
        ) : (
          <section className="space-y-4" aria-label="내 문의 목록">
            {inquiries.map((inquiry) => (
              <Link key={inquiry.inquiryId} href={`/support/inquiries/${inquiry.inquiryId}`} className="block rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:border-green-200 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-green-700">{SUPPORT_INQUIRY_CATEGORY_LABELS[inquiry.category]}</p>
                    <h2 className="mt-2 break-words text-lg font-extrabold text-gray-900">{inquiry.subject}</h2>
                    <time dateTime={inquiry.createdAt} className="mt-2 block text-xs font-medium text-gray-500">접수 {dateFormatter.format(new Date(inquiry.createdAt))}</time>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getSupportInquiryStatusClassName(inquiry.status)}`}>{SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-gray-500">{inquiry.answeredAt ? '관리자 답변이 등록되었습니다.' : '답변을 기다리고 있습니다.'}</p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
