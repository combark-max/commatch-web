'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Crown,
  FileWarning,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  UserCog,
  Users,
} from 'lucide-react';

type AdminNavigationProps = {
  canViewReports: boolean;
  canViewPremium: boolean;
  canViewMembers: boolean;
  canManageAdmins: boolean;
  canManageNotices: boolean;
  canViewSupportInquiries: boolean;
};

const activeClassName = 'bg-green-100 text-green-800';
const defaultClassName = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';

export default function AdminNavigation({
  canViewReports,
  canViewPremium,
  canViewMembers,
  canManageAdmins,
  canManageNotices,
  canViewSupportInquiries,
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

        {canViewMembers ? (
          <Link
            href="/admin/members"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/members') ? activeClassName : defaultClassName}`}
          >
            <Users size={17} aria-hidden="true" />
            회원 관리
          </Link>
        ) : null}
        {canManageAdmins ? (
          <Link
            href="/admin/admins"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/admins') ? activeClassName : defaultClassName}`}
          >
            <UserCog size={17} aria-hidden="true" />
            관리자 계정 관리
          </Link>
        ) : null}
        {canManageNotices ? (
          <Link
            href="/admin/notices"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/notices') ? activeClassName : defaultClassName}`}
          >
            <Megaphone size={17} aria-hidden="true" />
            공지사항 관리
          </Link>
        ) : null}
        {canViewSupportInquiries ? (
          <Link
            href="/admin/inquiries"
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/inquiries') ? activeClassName : defaultClassName}`}
          >
            <MessagesSquare size={17} aria-hidden="true" />
            1:1 문의
          </Link>
        ) : null}
        <Link
          href="/admin/statistics"
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${pathname.startsWith('/admin/statistics') ? activeClassName : defaultClassName}`}
        >
          <BarChart3 size={17} aria-hidden="true" />
          회원 통계
        </Link>
      </div>
    </nav>
  );
}
