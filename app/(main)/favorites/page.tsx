"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { Loader2, User, MapPin, Briefcase, Heart, Search } from 'lucide-react';
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
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const fetchFavorites = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setFavorites([]);
          router.replace('/login');
          return;
        }

        const { data: favoriteRows, error: favoriteError } = await supabase
          .from('favorites')
          .select('favorite_user_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (favoriteError) {
          throw favoriteError;
        }

        const favoriteIds = favoriteRows?.map((item) => item.favorite_user_id) ?? [];

        if (favoriteIds.length === 0) {
          setFavorites([]);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, gender, birth_date, height, region, job, education, religion, hobby, introduction, profile_image')
          .in('id', favoriteIds);

        if (profilesError) {
          throw profilesError;
        }

        const profilesById = new Map(
          ((profiles as FavoriteMember[]) ?? []).map((profile) => [profile.id, {
            ...profile,
            profile_image: resolveProfileImageUrl(profile.profile_image),
          }]),
        );
        setFavorites(favoriteIds.flatMap((id) => {
          const profile = profilesById.get(id);
          return profile ? [profile] : [];
        }));
      } catch (err: unknown) {
        const supabaseError = err as { code?: string; message?: string; details?: string; hint?: string };
        console.error('관심회원 조회 실패:', {
          code: supabaseError.code ?? null,
          message: supabaseError.message ?? null,
          details: supabaseError.details ?? null,
          hint: supabaseError.hint ?? null,
        });
        setError('관심회원 목록을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavorites();
  }, [router, supabase]);

  const handleDeleteFavorite = async (favoriteUserId: string) => {
    if (isDeletingId) return;
    const removedIndex = favorites.findIndex((member) => member.id === favoriteUserId);
    const removedMember = favorites[removedIndex];
    setIsDeletingId(favoriteUserId);
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

      if (error) {
        throw error;
      }

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
    if (!birthDate) return '';

    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age -= 1;
    }

    return `${age}세`;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">관심회원 목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">관심회원</h1>
          <p className="mt-2 text-gray-600">좋아요 표시한 회원들을 한눈에 확인해보세요.</p>
        </div>

        {error ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-red-500">{error}</p>
            <Button className="rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => router.refresh()}>
              다시 시도
            </Button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-16 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-semibold text-gray-700">아직 관심회원이 없습니다.</p>
            <p className="mt-2 text-sm text-gray-500">회원 상세페이지에서 관심회원 추가를 해보세요.</p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => router.push('/members')}>
              회원 둘러보기
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {favorites.map((member) => (
              <div key={member.id} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm transition hover:shadow-lg">
                <div className="relative flex h-40 items-center justify-center bg-[#f0fdf4]">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-gray-300 shadow-sm">
                    {member.profile_image ? (
                      <img src={member.profile_image} alt={member.nickname ?? '프로필 이미지'} className="h-full w-full object-cover" />
                    ) : (
                      <User size={40} strokeWidth={1.5} />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="관심회원 해제"
                    disabled={isDeletingId === member.id}
                    onClick={() => handleDeleteFavorite(member.id)}
                    className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-md transition hover:scale-105 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Heart size={22} fill="currentColor" />
                  </button>
                </div>

                <div className="p-6">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{member.nickname || '익명'}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#16a34a]">{calculateAge(member.birth_date)}</p>
                    </div>
                  </div>

                  <div className="mb-5 space-y-2 text-sm text-gray-500">
                    <div className="flex items-center">
                      <MapPin size={14} className="mr-1.5 text-gray-400" />
                      {member.region || '지역 미설정'}
                    </div>
                    <div className="flex items-center">
                      <Briefcase size={14} className="mr-1.5 text-gray-400" />
                      {member.job || '직업 미설정'}
                    </div>
                  </div>

                  <p className="mb-6 min-h-[2.5rem] text-sm leading-relaxed text-gray-600 line-clamp-2">
                    {member.introduction || '자기소개가 아직 없습니다.'}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1 rounded-2xl py-3 text-sm font-bold"
                      onClick={() => router.push(`/members/${member.id}`)}
                    >
                      프로필 보기
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 rounded-2xl py-3 text-sm font-bold"
                      onClick={() => handleDeleteFavorite(member.id)}
                      disabled={isDeletingId === member.id}
                    >
                      {isDeletingId === member.id ? '삭제 중...' : '삭제'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
