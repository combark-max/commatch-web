'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Crown,
  FileWarning,
  LayoutDashboard,
  UserCog,
  Users,
} from 'lucide-react';

type AdminNavigationProps = {
  canViewReports: boolean;
  canViewPremium: boolean;
  canManageAdmins: boolean;
};

const activeClassName = 'bg-green-100 text-green-800';
const defaultClassName = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';

export default function AdminNavigation({
  canViewReports,
  canViewPremium,
  canManageAdmins,
}: AdminNavigationProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="관리자 메뉴" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname === '/admin' ? activeClassName : defaultClassName}`}
        >
          <LayoutDashboard size={17} aria-hidden="true" />
          대시보드
        </Link>

        {canViewReports ? (
          <Link
            href="/admin/reports"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/reports') ? activeClassName : defaultClassName}`}
          >
            <FileWarning size={17} aria-hidden="true" />
            신고 관리
          </Link>
        ) : null}

        {canViewPremium ? (
          <Link
            href="/admin/premium"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/premium') ? activeClassName : defaultClassName}`}
          >
            <Crown size={17} aria-hidden="true" />
            Premium 관리
          </Link>
        ) : null}

        <span aria-disabled="true" className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-gray-400">
          <Users size={17} aria-hidden="true" />
          회원 관리 <span className="text-xs">— 준비 중</span>
        </span>
        <span aria-disabled="true" className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-gray-400">
          <UserCog size={17} aria-hidden="true" />
          {canManageAdmins ? '관리자 계정 관리' : '관리자 관리'} <span className="text-xs">— 준비 중</span>
        </span>
        <span aria-disabled="true" className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-gray-400">
          <BarChart3 size={17} aria-hidden="true" />
          서비스 통계 <span className="text-xs">— 준비 중</span>
        </span>
      </div>
    </nav>
  );
}
