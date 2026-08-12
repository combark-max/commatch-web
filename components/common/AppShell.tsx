'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  CircleUser,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser, signOut } from '@/lib/auth/auth';

type AppShellProps = {
  children: React.ReactNode;
};

const accountLinks = [
  { href: '/dashboard', label: '마이페이지', icon: LayoutDashboard },
  { href: '/profile/create', label: '내 프로필 수정', icon: UserRound },
  { href: '/preference', label: '이상형 수정', icon: SlidersHorizontal },
  { href: '/favorites', label: '관심회원', icon: Heart },
  { href: '/account', label: '계정 설정', icon: Settings },
];

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isAccountSuspendedPage = pathname === '/account-suspended';
  const router = useRouter();
  const supabase = createClient();
  const headerRef = useRef<HTMLElement | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isAccountSuspendedPage) return;

    let isMounted = true;

    const syncUser = async (userId?: string) => {
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await getCurrentUser();
        resolvedUserId = user?.id;
      }

      if (!isMounted) return;
      setIsLoggedIn(Boolean(resolvedUserId));

      if (!resolvedUserId) {
        setNickname(null);
        setUnreadNotificationCount(0);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', resolvedUserId)
        .maybeSingle();

      if (isMounted) setNickname(data?.nickname ?? null);
    };

    syncUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user.id);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [isAccountSuspendedPage, supabase]);

  useEffect(() => {
    if (!isLoggedIn || isAccountSuspendedPage) return;

    let isMounted = true;

    const loadUnreadNotificationCount = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);

      if (!isMounted) return;
      if (error) {
        setUnreadNotificationCount(0);
        return;
      }

      setUnreadNotificationCount(count ?? 0);
    };

    const handleNotificationsChanged = () => {
      void loadUnreadNotificationCount();
    };

    void loadUnreadNotificationCount();
    window.addEventListener('commatch:notifications-changed', handleNotificationsChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('commatch:notifications-changed', handleNotificationsChanged);
    };
  }, [isAccountSuspendedPage, isLoggedIn, pathname, supabase]);

  useEffect(() => {
    const closeMenus = () => {
      setIsAccountMenuOpen(false);
      setIsMobileMenuOpen(false);
    };
    const timeoutId = window.setTimeout(closeMenus, 0);
    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeMenus = () => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    closeMenus();
    const { error } = await signOut();
    if (error) {
      console.error('로그아웃 실패:', error);
      return;
    }
    setIsLoggedIn(false);
    setNickname(null);
    setUnreadNotificationCount(0);
    router.push('/');
    router.refresh();
  };

  const accountLabel = nickname ? `${nickname}님` : '내정보';
  const isHome = pathname === '/';
  const unreadBadgeLabel = unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  if (isAccountSuspendedPage) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="border-b border-gray-100 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-2xl font-black text-green-600">
              ComMatch
            </Link>
            <nav aria-label="공개 내비게이션" className="flex items-center gap-3 text-sm font-semibold text-gray-600 sm:gap-5">
              <Link href="/notices" className="transition-colors hover:text-green-600">공지사항</Link>
              <Link href="/faq" className="transition-colors hover:text-green-600">FAQ</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header ref={headerRef} className="sticky top-0 z-[60] border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" onClick={closeMenus} className={`text-2xl font-black ${isHome ? 'text-[#2E7D32]' : 'text-green-600'}`}>
            ComMatch
          </Link>

          <nav aria-label="주요 내비게이션" className="hidden items-center gap-5 text-sm font-semibold text-gray-600 md:flex">
            <Link href="/" className="transition-colors hover:text-green-600">홈</Link>
            <Link href="/notices" className="transition-colors hover:text-green-600">공지사항</Link>
            <Link href="/faq" className="transition-colors hover:text-green-600">FAQ</Link>
            {isLoggedIn ? (
              <>
                <Link
                  href="/notifications"
                  onClick={closeMenus}
                  aria-label={unreadNotificationCount > 0 ? `읽지 않은 알림 ${unreadNotificationCount}개` : '알림'}
                  aria-current={pathname === '/notifications' ? 'page' : undefined}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
                    pathname === '/notifications'
                      ? 'bg-green-100 text-green-700'
                      : 'text-gray-500 hover:bg-green-50 hover:text-green-700'
                  }`}
                >
                  <Bell size={20} />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white">
                      {unreadBadgeLabel}
                    </span>
                  ) : null}
                </Link>
                <div className="relative">
                <button
                  type="button"
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsAccountMenuOpen((current) => !current)}
                  className="flex items-center gap-2 rounded-full border-2 border-green-600 bg-white px-4 py-2 text-green-600 transition hover:bg-green-50"
                >
                  <CircleUser size={18} />
                  <span>{accountLabel}</span>
                  <ChevronDown size={16} className={`transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isAccountMenuOpen ? (
                  <div role="menu" className="absolute right-0 top-full z-[70] mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                    {accountLinks.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        role="menuitem"
                        onClick={closeMenus}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-700 transition hover:bg-green-50 hover:text-green-700"
                      >
                        <Icon size={18} />
                        {label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="mt-1 flex w-full items-center gap-3 border-t border-gray-100 px-3 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut size={18} />
                      로그아웃
                    </button>
                  </div>
                ) : null}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className={isHome
                    ? 'flex items-center gap-1.5 rounded-xl border border-[#2E7D32] px-4 py-2.5 text-base text-[#2E7D32] transition-colors hover:bg-green-50'
                    : 'flex items-center gap-1.5 transition-colors hover:text-green-600'}
                >
                  <LogIn size={17} /> 로그인
                </Link>
                {isHome ? (
                  <Link href="/signup" className="rounded-xl bg-[#2E7D32] px-5 py-2.5 text-base text-white transition-colors hover:bg-[#256729]">
                    회원가입
                  </Link>
                ) : null}
              </div>
            )}
          </nav>

          <button
            type="button"
            aria-label={isMobileMenuOpen ? '모바일 메뉴 닫기' : '모바일 메뉴 열기'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-700 transition hover:bg-green-50 hover:text-green-600 md:hidden"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMobileMenuOpen ? (
          <nav id="mobile-navigation" aria-label="모바일 내비게이션" className="absolute left-0 right-0 top-full z-[70] border-t border-gray-100 bg-white p-4 shadow-xl md:hidden">
            <Link href="/" onClick={closeMenus} className="block rounded-xl px-4 py-3 font-semibold text-gray-700 hover:bg-green-50">홈</Link>
            <Link href="/notices" onClick={closeMenus} className="block rounded-xl px-4 py-3 font-semibold text-gray-700 hover:bg-green-50">공지사항</Link>
            <Link href="/faq" onClick={closeMenus} className="block rounded-xl px-4 py-3 font-semibold text-gray-700 hover:bg-green-50">FAQ</Link>
            {isLoggedIn ? (
              <>
                <p className="px-4 pb-2 pt-4 text-xs font-bold text-green-600">{accountLabel}</p>
                <Link
                  href="/notifications"
                  onClick={closeMenus}
                  aria-current={pathname === '/notifications' ? 'page' : undefined}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-gray-700 hover:bg-green-50 hover:text-green-700"
                >
                  <Bell size={19} />
                  <span className="flex-1">알림</span>
                  {unreadNotificationCount > 0 ? (
                    <span className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white">
                      {unreadBadgeLabel}
                    </span>
                  ) : null}
                </Link>
                {accountLinks.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={closeMenus} className="flex items-center gap-3 rounded-xl px-4 py-3 text-gray-700 hover:bg-green-50 hover:text-green-700">
                    <Icon size={19} /> {label}
                  </Link>
                ))}
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50">
                  <LogOut size={19} /> 로그아웃
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={closeMenus} className="flex items-center gap-3 rounded-xl px-4 py-3 text-gray-700 hover:bg-green-50">
                  <LogIn size={19} /> 로그인
                </Link>
                {isHome ? (
                  <Link href="/signup" onClick={closeMenus} className="mt-2 block rounded-xl bg-[#2E7D32] px-4 py-3 text-center font-bold text-white hover:bg-[#256729]">
                    회원가입
                  </Link>
                ) : null}
              </>
            )}
          </nav>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
