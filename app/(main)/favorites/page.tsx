'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Loader2, MapPin, Search, Sparkles, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

type FavoriteMember = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  religion: string | null;
  hobby: string | null;
  introduction: string | null;
  profile_image: string | null;
};

export default function FavoritesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [favorites, setFavorites] = useState<FavoriteMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [likeNoticeMemberId, setLikeNoticeMemberId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchFavorites = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (isMounted) setFavorites([]);
          router.replace('/login');
          return;
        }

        const { data: favoriteRows, error: favoriteError } = await supabase
          .from('favorites')
          .select('favorite_user_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (favoriteError) throw favoriteError;

        const favoriteIds = favoriteRows?.map((item) => item.favorite_user_id) ?? [];

        if (favoriteIds.length === 0) {
          if (isMounted) setFavorites([]);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, gender, birth_date, height, region, job, education, religion, hobby, introduction, profile_image')
          .in('id', favoriteIds);

        if (profilesError) throw profilesError;

        const profilesById = new Map(
          ((profiles as FavoriteMember[]) ?? []).map((profile) => [profile.id, {
            ...profile,
            profile_image: resolveProfileImageUrl(profile.profile_image),
          }]),
        );

        if (isMounted) {
          setFavorites(favoriteIds.flatMap((id) => {
            const profile = profilesById.get(id);
            return profile ? [profile] : [];
          }));
        }
      } catch (err: unknown) {
        const supabaseError = err as { code?: string; message?: string; details?: string; hint?: string };
        console.error('관심회원 조회 실패:', {
          code: supabaseError.code ?? null,
          message: supabaseError.message ?? null,
          details: supabaseError.details ?? null,
          hint: supabaseError.hint ?? null,
        });
        if (isMounted) {
          setError('관심목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchFavorites();

    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/dashboard');
  };

  const handleDeleteFavorite = async (favoriteUserId: string) => {
    if (isDeletingId) return;
    if (!window.confirm('관심목록에서 삭제하시겠습니까?')) return;

    const removedIndex = favorites.findIndex((member) => member.id === favoriteUserId);
    const removedMember = favorites[removedIndex];
    setIsDeletingId(favoriteUserId);
    setLikeNoticeMemberId((current) => current === favoriteUserId ? null : current);
    setFavorites((current) => current.filter((member) => member.id !== favoriteUserId));

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (removedMember) {
          setFavorites((current) => {
            const next = [...current];
            next.splice(removedIndex, 0, removedMember);
            return next;
          });
        }
        router.replace('/login');
        return;
      }

      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('favorite_user_id', favoriteUserId);

      if (error) throw error;

      setToast({ message: '관심회원에서 해제했습니다.', type: 'success' });
    } catch (err: unknown) {
      if (removedMember) {
        setFavorites((current) => {
          const next = [...current];
          next.splice(removedIndex, 0, removedMember);
          return next;
        });
      }
      const supabaseError = err as { code?: string; message?: string; details?: string; hint?: string };
      console.error('관심회원 삭제 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setToast({ message: '관심회원 해제에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
    } finally {
      setIsDeletingId(null);
    }
  };

  const calculateAge = (birthDate: string | null | undefined) => {
    if (!birthDate) return null;

    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age -= 1;
    }

    return age;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">관심목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
          >
            <ArrowLeft size={19} /> 뒤로가기
          </button>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">관심목록</h1>
              <p className="mt-2 text-gray-600">관심 등록한 회원의 프로필을 다시 확인해 보세요.</p>
            </div>
            <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
              관심 {favorites.length}명
            </span>
          </div>
        </div>

        {error ? (
          <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-red-600">{error}</p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => setRetryKey((key) => key + 1)}>
              다시 시도
            </Button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-800">관심 회원이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              오늘의 추천에서 마음에 드는 회원을 관심목록에 추가해 보세요.
            </p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => router.push('/ai-match')}>
              오늘의 추천 보기
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {favorites.map((member) => {
              const age = calculateAge(member.birth_date);
              const hasImage = Boolean(member.profile_image) && !failedImageIds.has(member.id);

              return (
                <article key={member.id} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm transition hover:shadow-lg">
                  <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[#f0fdf4] p-4">
                    {hasImage ? (
                      <img
                        src={member.profile_image ?? ''}
                        alt={member.nickname ?? '프로필 이미지'}
                        onError={() => setFailedImageIds((current) => new Set(current).add(member.id))}
                        className="h-full w-full rounded-2xl object-contain"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-sm">
                        <User size={48} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{member.nickname || '익명'}</h2>
                        <p className="mt-1 text-sm font-semibold text-[#16a34a]">
                          {age !== null ? `만 ${age}세` : '나이 정보 미입력'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                      <p className="flex items-center gap-2">
                        <MapPin size={15} className="text-gray-400" />
                        {member.region || '지역 정보 미입력'}
                      </p>
                      <p className="flex items-center gap-2">
                        <Briefcase size={15} className="text-gray-400" />
                        {member.job || '직업 정보 미입력'}
                      </p>
                    </div>

                    <section className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                          <Sparkles size={15} /> AI 추천 이유
                        </h3>
                        <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-500">도입 예정</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">AI 추천 이유 기능은 도입 예정입니다.</p>
                    </section>

                    {likeNoticeMemberId === member.id ? (
                      <p role="status" className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                        좋아요 기능은 도입 예정입니다.
                      </p>
                    ) : null}

                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                      <Button
                        className="min-h-11 rounded-2xl px-4 py-3 text-sm font-bold"
                        onClick={() => member.id && router.push(`/members/${member.id}`)}
                      >
                        상세보기
                      </Button>
                      <button
                        type="button"
                        onClick={() => setLikeNoticeMemberId(member.id)}
                        className="min-h-11 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500 transition hover:bg-gray-100"
                      >
                        좋아요 · 도입 예정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFavorite(member.id)}
                        disabled={isDeletingId === member.id}
                        className="min-h-11 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
                      >
                        {isDeletingId === member.id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
