import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getSupportInquiryStatusClassName,
  isSupportInquiryStatus,
  parseAdminSupportInquiryList,
  SUPPORT_INQUIRY_CATEGORY_LABELS,
  SUPPORT_INQUIRY_STATUS_LABELS,
  type SupportInquiryStatus,
} from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;
const dateFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const pageNumber = (value?: string) => value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 1;
const href = (status: SupportInquiryStatus | null, page: number) => {
  const query = new URLSearchParams(); if (status) query.set('status', status); if (page > 1) query.set('page', String(page));
  return query.size ? `/admin/inquiries?${query}` : '/admin/inquiries';
};

export default async function AdminSupportInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; page?: string | string[] }> }) {
  await requireAdminAccess('support_inquiries_view');
  const query = await searchParams;
  const rawStatus = first(query.status);
  const status = isSupportInquiryStatus(rawStatus) ? rawStatus : null;
  const page = pageNumber(first(query.page));
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_support_inquiries', { p_status: status, p_page: page, p_page_size: PAGE_SIZE });
  const inquiries = error ? null : parseAdminSupportInquiryList(data);
  const totalCount = inquiries?.[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return <div className="space-y-6">
    <header><h1 className="text-3xl font-black text-gray-900">1:1 문의 관리</h1><p className="mt-3 text-gray-600">회원 문의를 확인하고 답변합니다.</p></header>
    <form method="get" action="/admin/inquiries" className="flex flex-wrap items-end gap-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="min-w-52 flex-1"><label htmlFor="inquiry-status-filter" className="mb-2 block text-sm font-semibold text-gray-700">상태</label><select id="inquiry-status-filter" name="status" defaultValue={status ?? ''} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"><option value="">전체</option><option value="pending">답변 대기</option><option value="answered">답변 완료</option><option value="closed">종결</option></select></div>
      <button className="inline-flex h-11 items-center gap-2 rounded-full bg-green-600 px-5 text-sm font-bold text-white"><Search size={16} />조회</button><Link href="/admin/inquiries" className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-gray-300 px-5 text-sm font-bold text-gray-600"><RotateCcw size={16} />초기화</Link>
    </form>
    {inquiries === null ? <p role="alert" className="rounded-3xl bg-red-50 p-6 font-semibold text-red-700"><AlertCircle className="mr-2 inline" size={19} />문의 목록을 불러오지 못했습니다.</p> : inquiries.length === 0 ? <p className="rounded-3xl bg-white p-12 text-center font-semibold text-gray-500">조건에 맞는 문의가 없습니다.</p> : <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{['접수일', '회원', '유형', '제목', '상태', '관리'].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{inquiries.map((inquiry) => <tr key={inquiry.inquiryId}><td className="whitespace-nowrap px-5 py-4 text-gray-600">{dateFormatter.format(new Date(inquiry.createdAt))}</td><td className="px-5 py-4 font-semibold text-gray-800">{inquiry.profileExists && inquiry.userNickname ? inquiry.userNickname : '프로필 정보 없음'}<span className="mt-1 block font-mono text-[11px] font-normal text-gray-400">{inquiry.userId.slice(0, 8)}</span></td><td className="px-5 py-4">{SUPPORT_INQUIRY_CATEGORY_LABELS[inquiry.category]}</td><td className="max-w-sm break-words px-5 py-4 font-bold text-gray-900">{inquiry.subject}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${getSupportInquiryStatusClassName(inquiry.status)}`}>{SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}</span></td><td className="px-5 py-4"><Link href={`/admin/inquiries/${inquiry.inquiryId}`} className="font-bold text-green-700">상세 보기</Link></td></tr>)}</tbody></table></div></section>}
    {totalCount > 0 ? <nav className="flex items-center justify-center gap-3" aria-label="문의 목록 페이지">{page > 1 ? <Link href={href(status, page - 1)} className="rounded-full border bg-white px-4 py-2 text-sm font-semibold"><ChevronLeft className="inline" size={16} />이전</Link> : <span className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-400">이전</span>}<span className="text-sm font-semibold">{page} / {totalPages}</span>{page < totalPages ? <Link href={href(status, page + 1)} className="rounded-full border bg-white px-4 py-2 text-sm font-semibold">다음<ChevronRight className="inline" size={16} /></Link> : <span className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-400">다음</span>}</nav> : null}
  </div>;
}
