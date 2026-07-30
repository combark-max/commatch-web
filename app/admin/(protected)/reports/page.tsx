import { FileWarning } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';

export default async function AdminReportsPage() {
  await requireAdminAccess('reports_view');

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm sm:p-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
        <FileWarning size={28} aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-3xl font-black text-gray-900">신고 관리</h1>
      <p className="mt-4 text-gray-600">신고 관리 화면은 다음 단계에서 구성합니다.</p>
    </section>
  );
}
