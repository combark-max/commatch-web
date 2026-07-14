"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/auth';
import { createClient } from '@/lib/supabase/client';
import Button from '../ui/Button';

const Navbar = () => {
  const router = useRouter();
  const supabase = createClient();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(Boolean(user));
    };

    checkSession();
  }, [supabase]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
    setIsLoggedIn(false);
    router.push('/');
  };

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex flex-shrink-0 items-center">
            <Link href="/" className="text-2xl font-bold text-green-600">
              ComMatch
            </Link>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 sm:gap-4">
            <Link href="/" className="transition-colors hover:text-green-600">
              홈
            </Link>

            {isLoggedIn ? (
              <>
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    aria-expanded={isMenuOpen}
                    className="transition-colors hover:text-green-600"
                  >
                    내정보
                  </button>

                  {isMenuOpen ? (
                    <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                      <Link
                        href="/dashboard"
                        onClick={closeMenu}
                        className="block rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-green-50 hover:text-green-600"
                      >
                        대시보드
                      </Link>
                      <Link
                        href="/profile/create"
                        onClick={closeMenu}
                        className="mt-1 block rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-green-50 hover:text-green-600"
                      >
                        프로필 수정
                      </Link>
                      <Link
                        href="/preference"
                        onClick={closeMenu}
                        className="mt-1 block rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-green-50 hover:text-green-600"
                      >
                        이상형 수정
                      </Link>
                    </div>
                  ) : null}
                </div>

                <Button variant="outline" size="md" className="px-3 py-2 text-sm" onClick={handleLogout}>
                  로그아웃
                </Button>
              </>
            ) : (
              <Link href="/login" className="transition-colors hover:text-green-600 font-semibold">
                로그인
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
