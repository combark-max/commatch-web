import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { answerSupportInquiryAction, closeSupportInquiryAction } from '@/app/admin/(protected)/inquiries/actions';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getSupportInquiryStatusClassName, isUuid, parseAdminSupportInquiryActions,
  parseAdminSupportInquiryDetail, SUPPORT_INQUIRY_CATEGORY_LABELS, SUPPORT_INQUIRY_STATUS_LABELS,
} from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
const RESULTS: Record<string, string> = { answered: '답변을 저장했습니다.', closed: '문의를 종결했습니다.' };
const ERRORS: Record<string, string> = { stale: '다른 관리자가 먼저 문의를 변경했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.', validation: '요청 내용이나 현재 문의 상태를 확인해 주세요.', forbidden: '문의 관리 권한이 없습니다.', 'not-found': '문의를 찾을 수 없습니다.', 'save-failed': '변경 내용을 저장하지 못했습니다.' };

export default async function AdminSupportInquiryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ result?: string | string[]; error?: string | string[] }> }) {
  const access = await requireAdminAccess('support_inquiries_view');
  const { id } = await params; if (!isUuid(id)) notFound();
  const supabase = await createServerSupabaseClient();
  const [detailResult, actionsResult] = await Promise.all([
    supabase.rpc('get_admin_support_inquiry', { p_inquiry_id: id }),
    supabase.rpc('get_admin_support_inquiry_actions', { p_inquiry_id: id }),
  ]);
  if (detailResult.error) return <p role="alert" className="rounded-2xl bg-red-50 p-5 font-semibold text-red-700">문의 내용을 불러오지 못했습니다.</p>;
  const inquiry = parseAdminSupportInquiryDetail(detailResult.data); if (!inquiry) notFound();
  const actions = actionsResult.error ? null : parseAdminSupportInquiryActions(actionsResult.data);
  const query = await searchParams; const resultKey = Array.isArray(query.result) ? query.result[0] : query.result; const errorKey = Array.isArray(query.error) ? query.error[0] : query.error;
  const canManage = access.permissions.includes('support_inquiries_manage');
  return <div className="space-y-6">
    <Link href="/admin/inquiries" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gray-600"><ArrowLeft size={18} />문의 목록으로</Link>
    {resultKey && RESULTS[resultKey] ? <p role="status" className="rounded-2xl bg-green-50 p-4 font-semibold text-green-800">{RESULTS[resultKey]}</p> : null}{errorKey && ERRORS[errorKey] ? <p role="alert" className="rounded-2xl bg-red-50 p-4 font-semibold text-red-700">{ERRORS[errorKey]}</p> : null}
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-green-700">{SUPPORT_INQUIRY_CATEGORY_LABELS[inquiry.category]}</p><h1 className="mt-2 break-words text-3xl font-black text-gray-900">{inquiry.subject}</h1></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getSupportInquiryStatusClassName(inquiry.status)}`}>{SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}</span></header>
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"><dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="font-semibold text-gray-500">회원</dt><dd className="mt-1 font-bold text-gray-900">{inquiry.profileExists && inquiry.userNickname ? inquiry.userNickname : '프로필 정보 없음'}</dd></div><div><dt className="font-semibold text-gray-500">회원 ID</dt><dd className="mt-1 break-all font-mono text-xs">{inquiry.userId}</dd></div><div><dt className="font-semibold text-gray-500">접수일</dt><dd className="mt-1">{dateFormatter.format(new Date(inquiry.createdAt))}</dd></div></dl><div className="mt-6 border-t pt-6"><h2 className="font-black">문의 내용</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{inquiry.body}</p></div></section>
    <section className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">관리자 답변</h2>{inquiry.answerBody ? <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-gray-50 p-5 text-sm leading-7">{inquiry.answerBody}</p> : <p className="mt-4 text-sm font-semibold text-amber-700">아직 답변이 없습니다.</p>}{inquiry.status !== 'closed' && canManage ? <form action={answerSupportInquiryAction} className="mt-6 space-y-4"><input type="hidden" name="inquiryId" value={inquiry.inquiryId} /><input type="hidden" name="expectedUpdatedAt" value={inquiry.updatedAt} /><label htmlFor="answer-body" className="block text-sm font-bold">{inquiry.answerBody ? '답변 수정' : '답변 작성'}</label><textarea id="answer-body" name="answerBody" required maxLength={5000} rows={10} defaultValue={inquiry.answerBody ?? ''} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-7" /><button className="rounded-full bg-green-600 px-6 py-3 text-sm font-bold text-white">답변 저장</button></form> : null}{inquiry.status === 'answered' && canManage ? <form action={closeSupportInquiryAction} className="mt-6 border-t pt-6"><input type="hidden" name="inquiryId" value={inquiry.inquiryId} /><input type="hidden" name="expectedUpdatedAt" value={inquiry.updatedAt} /><label className="flex gap-3 text-sm"><input type="checkbox" required />답변이 완료되어 문의를 종결합니다.</label><button className="mt-4 rounded-full border-2 border-gray-300 px-5 py-2.5 text-sm font-bold">문의 종결</button></form> : null}</section>
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">관리자 처리 이력</h2>{actions === null ? <p className="mt-4 text-sm font-semibold text-red-700">처리 이력을 불러오지 못했습니다.</p> : actions.length === 0 ? <p className="mt-4 text-sm text-gray-500">아직 처리 이력이 없습니다.</p> : <ol className="mt-4 space-y-3">{actions.map((action) => <li key={action.actionId} className="rounded-2xl bg-gray-50 p-4 text-sm"><div className="flex justify-between gap-3"><strong>{action.action === 'answer' ? '답변 등록' : action.action === 'answer_update' ? '답변 수정' : '문의 종결'}</strong><time dateTime={action.createdAt} className="text-xs text-gray-500">{dateFormatter.format(new Date(action.createdAt))}</time></div><p className="mt-2 text-xs text-gray-500">{SUPPORT_INQUIRY_STATUS_LABELS[action.previousStatus]} → {SUPPORT_INQUIRY_STATUS_LABELS[action.newStatus]} · 관리자 역할 {action.adminRole ?? '정보 없음'}</p></li>)}</ol>}</section>
  </div>;
}
