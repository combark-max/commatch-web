import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import AdminAccountCreateForm from '@/components/admin/AdminAccountCreateForm';
import { requireAdminAccess } from '@/lib/admin/access';

export default async function NewAdminAccountPage() {
  await requireAdminAccess('admin_accounts_manage');

  return (
    <div className="space-y-6">
      <Link href="/admin/admins" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> 관리자 계정 목록
      </Link>
      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <UserPlus className="mt-1 shrink-0 text-green-700" size={26} aria-hidden="true" />
          <div>
            <h1 className="text-3xl font-black text-gray-900">관리자 계정 생성</h1>
            <p className="mt-3 max-w-3xl text-gray-600">등록된 사용자의 UUID를 확인한 뒤 관리자 역할을 부여합니다. 새 관리자 계정은 활성 상태로 생성됩니다.</p>
          </div>
        </div>
      </section>
      <section aria-labelledby="admin-account-create-form" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="admin-account-create-form" className="text-xl font-black text-gray-900">생성 정보</h2>
        <p className="mt-2 text-sm text-gray-600">생성 전 확인 단계에서 대상 UUID와 역할을 다시 확인할 수 있습니다.</p>
        <div className="mt-6 max-w-3xl"><AdminAccountCreateForm /></div>
      </section>
    </div>
  );
}
