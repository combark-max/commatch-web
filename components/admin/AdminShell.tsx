import Link from 'next/link';
import { LayoutDashboard, ShieldCheck } from 'lucide-react';
import AdminLogoutButton from '@/components/admin/AdminLogoutButton';
import AdminNavigation from '@/components/admin/AdminNavigation';

type AdminShellProps = {
  children: React.ReactNode;
  roleLabel: string;
  canViewReports: boolean;
  canViewPremium: boolean;
  canViewMembers: boolean;
  canManageAdmins: boolean;
  canManageNotices: boolean;
  canViewSupportInquiries: boolean;
};

export default function AdminShell({
  children,
  roleLabel,
  canViewReports,
  canViewPremium,
  canViewMembers,
  canManageAdmins,
  canManageNotices,
  canViewSupportInquiries,
}: AdminShellProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              aria-label="관리자 대시보드로 이동"
              title="관리자 대시보드"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 transition hover:border-green-200 hover:bg-green-50 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              <LayoutDashboard size={22} aria-hidden="true" />
              <span className="sr-only">관리자 대시보드로 이동</span>
            </Link>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-black text-gray-900">ComMatch 관리자</p>
              <p className="text-sm font-medium text-gray-500">현재 역할: {roleLabel}</p>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>
      <AdminNavigation
        canViewReports={canViewReports}
        canViewPremium={canViewPremium}
        canViewMembers={canViewMembers}
        canManageAdmins={canManageAdmins}
        canManageNotices={canManageNotices}
        canViewSupportInquiries={canViewSupportInquiries}
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
