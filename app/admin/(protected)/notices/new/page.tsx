import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAdminNoticeAction } from '@/app/admin/(protected)/notices/actions';
import { requireAdminAccess } from '@/lib/admin/access';

const ERROR_MESSAGES: Record<string, string> = {
  validation: '제목과 본문의 입력 내용을 확인해 주세요.',
  forbidden: '공지사항을 작성할 권한이 없습니다.',
  'save-failed': '공지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export default async function NewAdminNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  await requireAdminAccess('notices_manage');
  const query = await searchParams;
  const errorKey = Array.isArray(query.error) ? query.error[0] : query.error;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null;

  return (
    <div className="space-y-6">
      <Link href="/admin/notices" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900">
        <ArrowLeft size={18} aria-hidden="true" /> 공지 목록으로 돌아가기
      </Link>
      <header>
        <h1 className="text-3xl font-black text-gray-900">새 공지 작성</h1>
        <p className="mt-3 text-gray-600">새 공지는 작성 중 상태로 저장되며, 확인 후 별도로 게시할 수 있습니다.</p>
      </header>

      {errorMessage ? <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      <form action={createAdminNoticeAction} className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <label htmlFor="notice-title" className="mb-2 block text-sm font-bold text-gray-800">제목</label>
          <input id="notice-title" name="title" type="text" required maxLength={150} className="h-12 w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" />
          <p className="mt-2 text-xs text-gray-500">1자 이상 150자 이하</p>
        </div>
        <div>
          <label htmlFor="notice-body" className="mb-2 block text-sm font-bold text-gray-800">본문</label>
          <textarea id="notice-body" name="body" required maxLength={10000} rows={16} className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm leading-7 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20" />
          <p className="mt-2 text-xs text-gray-500">1자 이상 10,000자 이하</p>
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-600 px-6 text-sm font-bold text-white transition hover:bg-green-700">작성 중으로 저장</button>
      </form>
    </div>
  );
}
