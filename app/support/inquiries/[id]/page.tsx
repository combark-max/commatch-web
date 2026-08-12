import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import {
  getSupportInquiryStatusClassName,
  isUuid,
  parseMySupportInquiryDetail,
  SUPPORT_INQUIRY_CATEGORY_LABELS,
  SUPPORT_INQUIRY_STATUS_LABELS,
} from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

export default async function SupportInquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string | string[] }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data, error } = await supabase.rpc('get_my_support_inquiry', { p_inquiry_id: id });
  if (error) return <p role="alert" className="m-8 rounded-2xl bg-red-50 p-5 font-semibold text-red-700">문의 내용을 불러오지 못했습니다.</p>;
  const inquiry = parseMySupportInquiryDetail(data);
  if (!inquiry) notFound();
  const query = await searchParams;
  const result = Array.isArray(query.result) ? query.result[0] : query.result;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/support/inquiries" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 hover:bg-white hover:text-gray-900"><ArrowLeft size={18} /> 문의 목록으로</Link>
        {result === 'created' ? <p role="status" className="rounded-2xl bg-green-50 px-5 py-4 text-sm font-semibold text-green-800">문의가 정상적으로 접수되었습니다.</p> : null}
        <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-green-700">{SUPPORT_INQUIRY_CATEGORY_LABELS[inquiry.category]}</p><h1 className="mt-2 break-words text-2xl font-black text-gray-900">{inquiry.subject}</h1></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getSupportInquiryStatusClassName(inquiry.status)}`}>{SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}</span></div>
          <time dateTime={inquiry.createdAt} className="mt-4 block text-xs font-medium text-gray-500">접수 {dateFormatter.format(new Date(inquiry.createdAt))}</time>
          <div className="mt-6 border-t border-gray-100 pt-6"><h2 className="text-sm font-black text-gray-900">문의 내용</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{inquiry.body}</p></div>
        </article>
        <section className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="inquiry-answer-heading">
          <div className="flex items-center gap-2"><MessageCircle className="text-green-700" size={21} /><h2 id="inquiry-answer-heading" className="text-xl font-black text-gray-900">관리자 답변</h2></div>
          {inquiry.answerBody ? <><p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{inquiry.answerBody}</p>{inquiry.answerUpdatedAt ? <time dateTime={inquiry.answerUpdatedAt} className="mt-4 block text-xs font-medium text-gray-500">답변 {dateFormatter.format(new Date(inquiry.answerUpdatedAt))}</time> : null}</> : <p className="mt-5 rounded-2xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">답변 대기 중입니다. 문의 내용을 확인한 뒤 답변드리겠습니다.</p>}
        </section>
      </div>
    </div>
  );
}
