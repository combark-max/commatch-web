import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createMySupportInquiryAction } from '@/app/support/inquiries/actions';
import InquirySubmitButton from '@/components/support/InquirySubmitButton';
import { SUPPORT_INQUIRY_CATEGORIES, SUPPORT_INQUIRY_CATEGORY_LABELS } from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function NewSupportInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');
  const query = await searchParams;
  const errorKey = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/support/inquiries" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 hover:bg-white hover:text-gray-900"><ArrowLeft size={18} /> 문의 목록으로</Link>
        <header className="mt-6"><h1 className="text-3xl font-black text-gray-900">새 문의 작성</h1><p className="mt-3 text-sm leading-6 text-gray-600">문의 1건당 관리자 답변 1개가 제공됩니다. 내용을 구체적으로 작성해 주세요.</p></header>
        {errorKey ? <p role="alert" className="mt-6 rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{errorKey === 'validation' ? '문의 유형과 제목, 내용을 확인해 주세요.' : '문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.'}</p> : null}
        <form action={createMySupportInquiryAction} className="mt-6 space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <div><label htmlFor="inquiry-category" className="mb-2 block text-sm font-bold text-gray-800">문의 유형</label><select id="inquiry-category" name="category" required defaultValue="" className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20"><option value="" disabled>선택해 주세요.</option>{SUPPORT_INQUIRY_CATEGORIES.map((category) => <option key={category} value={category}>{SUPPORT_INQUIRY_CATEGORY_LABELS[category]}</option>)}</select></div>
          <div><label htmlFor="inquiry-subject" className="mb-2 block text-sm font-bold text-gray-800">제목</label><input id="inquiry-subject" name="subject" required maxLength={150} className="h-12 w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" /></div>
          <div><label htmlFor="inquiry-body" className="mb-2 block text-sm font-bold text-gray-800">문의 내용</label><textarea id="inquiry-body" name="body" required maxLength={5000} rows={12} className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm leading-7 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" /></div>
          <InquirySubmitButton />
        </form>
      </div>
    </div>
  );
}
