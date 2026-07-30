import { ShieldCheck } from 'lucide-react';
import AdminLogoutButton from '@/components/admin/AdminLogoutButton';
import { requireAdminAccess } from '@/lib/admin/access';

export default async function AdminPage() {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-gray-50 px-6 py-12 sm:py-16">
      <section className="mx-auto max-w-2xl rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-200/60 sm:p-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
          <ShieldCheck size={30} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-black text-gray-900">관리자 페이지</h1>
        <p className="mt-4 text-lg font-semibold text-green-700">관리자 인증이 완료되었습니다.</p>
        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm font-medium text-gray-500">현재 역할</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{adminAccess.role}</p>
        </div>
        <p className="mt-6 text-sm leading-6 text-gray-600">
          관리자 대시보드는 다음 단계에서 구성합니다.
        </p>
        <div className="mt-8">
          <AdminLogoutButton />
        </div>
      </section>
    </main>
  );
}
