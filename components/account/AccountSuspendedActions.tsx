'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/auth';

export default function AccountSuspendedActions() {
  const router = useRouter();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      console.error('로그아웃 실패:', error);
      return;
    }

    router.replace('/');
    router.refresh();
  };

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
      >
        <LogOut size={18} aria-hidden="true" />
        로그아웃
      </button>
      <Link
        href="/account"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-green-600 bg-white px-5 py-3 font-bold text-green-700 transition hover:bg-green-50"
      >
        계정 관리
      </Link>
      <Link
        href="/"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-700 transition hover:bg-gray-50"
      >
        홈으로
      </Link>
    </div>
  );
}
