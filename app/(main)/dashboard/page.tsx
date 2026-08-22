'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Briefcase,
  Camera,
  ChevronRight,
  Heart,
  KeyRound,
  Loader2,
  LogOut,
  MessageCircle,
  Quote,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  UserRound,
  Users,
} from 'lucide-react';
import { signOut } from '@/lib/auth/auth';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { createClient } from '@/lib/supabase/client';
import ImageModal from '@/components/common/ImageModal';

type Profile = {
  nickname: string | null;
  gender: string | null;
  birth_date: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  hobby: string | null;
  drinking: string | null;
  smoking: string | null;
  marriage_history: string | null;
  introduction: string | null;
  marriage_values: string | null;
  profile_image: string | null;
  profile_images: string[] | null;
};

type MatchSummaryRow = {
  total_unread_count: number | string | null;
};

const normalizeUnreadCount = (value: unknown) => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : 0;

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const calculateProfileCompleteness = (profile: Profile | null) => {
  if (!profile) return 0;

  const hasProfilePhoto = Boolean(profile.profile_image?.trim())
    || Boolean(profile.profile_images?.some((image) => typeof image === 'string' && image.trim()));
  const completedFields = [
    hasProfilePhoto,
    Boolean(profile.nickname?.trim()),
    Boolean(profile.gender?.trim()),
    Boolean(profile.birth_date?.trim()),
    typeof profile.height === 'number' && Number.isFinite(profile.height) && profile.height > 0,
    Boolean(profile.region?.trim()),
    Boolean(profile.job?.trim()),
    Boolean(profile.education?.trim()),
    Boolean(profile.hobby?.trim()),
    Boolean(profile.drinking?.trim()),
    Boolean(profile.smoking?.trim()),
    Boolean(profile.marriage_history?.trim()),
    (profile.introduction?.trim().length ?? 0) >= 10,
    (profile.marriage_values?.trim().length ?? 0) >= 10,
  ].filter(Boolean).length;

  return Math.round((completedFields / 14) * 100);
};

const profileLinks = [
  { label: '프로필 수정', description: '기본 프로필 정보를 관리합니다.', href: '/profile/create', icon: UserRound },
  { label: '사진 관리', description: '프로필 사진을 등록하거나 변경합니다.', href: '/profile/create#photos', icon: Camera },
  { label: '자기소개 수정', description: '나를 소개하는 문구를 관리합니다.', href: '/profile/create#introduction', icon: Quote },
  { label: '생활 정보 수정', description: '직업, 지역과 생활 정보를 관리합니다.', href: '/profile/create#lifestyle', icon: Briefcase },
  { label: '결혼 가치관 수정', description: '결혼 생활에서 중요하게 생각하는 가치관을 수정합니다.', href: '/profile/create#marriage-values', icon: Heart, status: undefined },
  { label: '이상형 설정', description: '희망하는 상대의 조건을 관리합니다.', href: '/preference', icon: SlidersHorizontal },
];

const supportItems = [
  {
    label: '1:1 문의',
    description: '서비스 이용 중 궁금한 점을 문의하고 답변을 확인합니다.',
    href: '/support/inquiries',
    icon: MessageCircle,
  },
  {
    label: '신고 내역',
    description: '내가 접수한 신고와 처리 상태를 확인합니다.',
    href: '/reports',
    icon: Shield,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [profileError, setProfileError] = useState(false);
  const [favoritesError, setFavoritesError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMyPage = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          router.replace('/login');
          return;
        }

        if (isMounted) setIsAuthenticated(true);

        const [profileResult, favoritesResult, matchesResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('nickname, gender, birth_date, height, region, job, education, hobby, drinking, smoking, marriage_history, introduction, marriage_values, profile_image, profile_images')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('favorites')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase.rpc('get_my_match_summary'),
        ]);

        if (profileResult.error) {
          console.error('마이페이지 프로필 조회 실패:', profileResult.error);
          if (isMounted) setProfileError(true);
        } else if (isMounted) {
          setProfile((profileResult.data as Profile | null) ?? null);
          setProfileError(false);
        }

        if (favoritesResult.error) {
          console.error('마이페이지 관심목록 개수 조회 실패:', favoritesResult.error);
          if (isMounted) setFavoritesError(true);
        } else if (isMounted) {
          setFavoriteCount(favoritesResult.count ?? 0);
          setFavoritesError(false);
        }

        if (matchesResult.error) {
          console.error('마이페이지 읽지 않은 메시지 수 조회 실패:', matchesResult.error.code, matchesResult.error.message);
          if (isMounted) setUnreadMessageCount(0);
        } else if (isMounted) {
          const summaryRow = Array.isArray(matchesResult.data)
            ? (matchesResult.data as MatchSummaryRow[])[0]
            : null;
          const totalUnreadCount = normalizeUnreadCount(summaryRow?.total_unread_count);
          setUnreadMessageCount(totalUnreadCount);
        }
      } catch (error: unknown) {
        console.error('마이페이지 정보 조회 실패:', error);
        if (isMounted) {
          setProfileError(true);
          setFavoritesError(true);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadMyPage();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const handleLogout = async () => {
    const { error } = await signOut();
    if (!error) {
      router.push('/login');
    } else {
      window.alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const profileCompletion = calculateProfileCompleteness(profile);
  const profileImageUrl = resolveProfileImageUrl(profile?.profile_image ?? null);
  const rawPhotoPaths = profile?.profile_images?.length
    ? profile.profile_images
    : profile?.profile_image
      ? [profile.profile_image]
      : [];
  const profilePhotoUrls = Array.from(new Set(
    rawPhotoPaths
      .filter((path) => Boolean(path?.trim()))
      .map((path) => resolveProfileImageUrl(path))
      .filter((url): url is string => Boolean(url)),
  )).slice(0, 5);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">
          {isLoading ? '마이페이지 정보를 불러오는 중...' : '로그인 화면으로 이동하는 중...'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">마이페이지</h1>
          <p className="mt-2 text-gray-600">내 활동과 프로필, 계정 정보를 한곳에서 관리하세요.</p>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
          <div className="grid gap-7 p-7 md:grid-cols-[auto_minmax(0,1fr)_220px] md:items-center md:p-9">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-green-50 bg-gray-100 text-gray-300 shadow-sm">
              {profileImageUrl && !imageFailed ? (
                <img
                  src={profileImageUrl}
                  alt={`${profile?.nickname ?? '회원'} 프로필 사진`}
                  onError={() => setImageFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User size={54} strokeWidth={1.5} />
              )}
            </div>

            <div>
              <p className="text-sm font-bold text-green-600">내 프로필</p>
              <h2 className="mt-1 text-2xl font-black text-gray-900">
                {profile?.nickname?.trim() || '프로필 정보가 없습니다.'}
              </h2>
              <div className="mt-5 max-w-xl">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-gray-800">프로필 완성도</span>
                  <span className="font-black text-green-700">{profileError ? '확인할 수 없음' : `${profileCompletion}%`}</span>
                </div>
                <div
                  className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100"
                  aria-label={profileError ? '프로필 완성도를 확인할 수 없음' : `프로필 완성도 ${profileCompletion}%`}
                >
                  <div className="h-full rounded-full bg-[#16a34a] transition-[width]" style={{ width: `${profileCompletion}%` }} />
                </div>
              </div>
              {profileError ? (
                <p className="mt-4 text-sm font-medium text-red-600">프로필 정보를 확인할 수 없습니다. 메뉴는 계속 이용할 수 있습니다.</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <Shield size={18} className="text-green-600" /> 회원 등급
              </div>
              <p className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-sm font-bold text-[#806B26]">도입 예정</p>
            </div>
          </div>

          {profilePhotoUrls.length > 0 ? (
            <div className="border-t border-gray-100 px-7 py-6 md:px-9">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-bold text-gray-900">내 프로필 사진</h3>
                <span className="text-xs font-medium text-gray-500">{profilePhotoUrls.length}장</span>
              </div>
              <div className="mt-4 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
                {profilePhotoUrls.map((photoUrl, index) => (
                  <button
                    key={photoUrl}
                    type="button"
                    onClick={() => setModalImageUrl(photoUrl)}
                    aria-label={`${index === 0 ? '대표 ' : ''}프로필 사진 ${index + 1} 크게 보기`}
                    className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                  >
                    <img
                      src={photoUrl}
                      alt={`${profile?.nickname ?? '내'} 프로필 사진 ${index + 1}`}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    {index === 0 ? (
                      <span className="absolute left-2 top-2 rounded-full bg-green-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
                        대표사진
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!profileError && profileCompletion < 80 ? (
            <Link
              href="/profile/create"
              className="flex items-center justify-between gap-4 border-t border-green-100 bg-green-50 px-7 py-5 text-sm font-semibold text-green-800 transition hover:bg-green-100 md:px-9"
            >
              <span>프로필을 조금만 더 작성하면 더 좋은 추천을 받을 수 있습니다.</span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-xl font-bold text-gray-900">내 활동</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ActivityLink href="/ai-match" title="오늘의 추천" status="추천 보기" icon={Sparkles} />
            <ActivityLink
              href="/favorites"
              title="관심목록"
              status={favoritesError ? '확인할 수 없음' : `관심 ${favoriteCount ?? 0}명`}
              icon={Heart}
            />
            <ActivityLink
              href="/matches"
              title="매칭 및 대화"
              description="새롭게 성립한 매칭과 대화를 확인할 수 있습니다."
              icon={MessageCircle}
              badge={unreadMessageCount}
            />
            <ActivityLink href="/members" title="회원 둘러보기" status="회원 보기" icon={Users} />
          </div>
        </section>

        <section aria-labelledby="profile-menu-heading">
          <h2 id="profile-menu-heading" className="text-xl font-bold text-gray-900">내 프로필</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profileLinks.map(({ label, description, href, icon: Icon, status }) => (
              <Link
                key={label}
                href={href}
                className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-green-200 hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                  <Icon size={21} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-bold text-gray-900 group-hover:text-green-700">
                    {label}
                    {status ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-[#806B26]">{status}</span> : null}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-gray-500">{description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 group-hover:text-green-600" />
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm md:p-9" aria-labelledby="premium-heading">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <Sparkles className="text-green-600" />
                <h2 id="premium-heading" className="text-xl font-bold text-gray-900">Premium</h2>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">제공 중</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">Premium 전용 혜택과 기능을 확인해 보세요.</p>
            </div>
            <Link
              href="/premium#premium-benefits"
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700"
            >
              Premium 혜택 보기 <ChevronRight size={17} />
            </Link>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="account-heading">
            <h2 id="account-heading" className="text-xl font-bold text-gray-900">계정 관리</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <MenuLink href="/forgot-password" label="비밀번호 변경" icon={KeyRound} />
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 border-t border-gray-100 px-5 py-4 text-left font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <LogOut size={20} className="text-gray-500" />
                <span className="flex-1">로그아웃</span>
                <ChevronRight size={18} className="text-gray-300" />
              </button>
              <Link
                href="/account#delete-account"
                className="flex items-center gap-3 border-t border-red-100 bg-red-50/50 px-5 py-4 font-semibold text-red-700 transition hover:bg-red-50"
              >
                <AlertTriangle size={20} />
                <span className="flex-1">회원 탈퇴</span>
                <ChevronRight size={18} className="text-red-300" />
              </Link>
            </div>
          </section>

          <section aria-labelledby="support-heading">
            <h2 id="support-heading" className="text-xl font-bold text-gray-900">고객지원</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {supportItems.map(({ label, description, href, icon: Icon }) => {
                if (href) {
                  return (
                    <Link
                      key={label}
                      href={href}
                      className="group rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-green-200 hover:shadow-md"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                        <Icon size={20} />
                      </span>
                      <span className="mt-4 block font-bold text-gray-700 group-hover:text-green-700">{label}</span>
                      <span className="mt-2 block text-sm leading-5 text-gray-500">{description}</span>
                    </Link>
                  );
                }

                return (
                  <button
                    key={label}
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                      <Icon size={20} />
                    </span>
                    <span className="mt-4 block font-bold text-gray-700">{label}</span>
                    <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">준비 중</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <ImageModal
        key={modalImageUrl ?? 'dashboard-profile-photo-modal'}
        isOpen={Boolean(modalImageUrl)}
        imageUrl={modalImageUrl}
        alt="내 프로필 사진"
        onClose={() => setModalImageUrl(null)}
      />
    </div>
  );
}

type LinkIcon = React.ComponentType<{ size?: number; className?: string }>;

function ActivityLink({
  href,
  title,
  description,
  status,
  icon: Icon,
  badge,
  muted = false,
  disabled = false,
}: {
  href?: string;
  title: string;
  description?: string;
  status?: string;
  icon: LinkIcon;
  badge?: number;
  muted?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${muted ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600'}`}>
        <Icon size={22} />
      </span>
      <span className="mt-5 flex items-center gap-2 font-bold text-gray-900 group-hover:text-green-700">
        {title}
        {typeof badge === 'number' && badge > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white" aria-label={`읽지 않은 새 메시지 ${badge}개`}>
            {badge}
          </span>
        ) : null}
      </span>
      {description ? <span className="mt-2 block text-sm leading-5 text-gray-500">{description}</span> : null}
      {status ? (
        <span className={`${description ? 'mt-3' : 'mt-2'} block text-sm font-semibold ${muted ? 'text-[#806B26]' : 'text-gray-500'}`}>
          {status}
        </span>
      ) : null}
    </>
  );

  if (disabled || !href) {
    return (
      <div
        aria-disabled="true"
        className="cursor-default rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-green-200 hover:shadow-md">
      {content}
    </Link>
  );
}

function MenuLink({ href, label, icon: Icon }: { href: string; label: string; icon: LinkIcon }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-4 font-semibold text-gray-700 transition hover:bg-green-50 hover:text-green-700">
      <Icon size={20} className="text-green-600" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={18} className="text-gray-300" />
    </Link>
  );
}
