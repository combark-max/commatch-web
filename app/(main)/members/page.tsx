"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { REGIONS } from '@/constants/regions';
import { JOBS, STANDARD_JOB_VALUES } from '@/constants/jobs';
import { User, MapPin, Briefcase, Heart, Loader2, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import DashboardNavigation from '@/components/common/DashboardNavigation';

type Member = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  region: string | null;
  job: string | null;
  introduction: string | null;
  profile_image?: string | null;
};

export default function MembersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [togglingFavoriteIds, setTogglingFavoriteIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('상관없음');
  const [selectedJob, setSelectedJob] = useState('상관없음');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchMembers = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          if (isMounted) {
            setError('로그인이 필요합니다.');
            setMembers([]);
            router.replace('/login');
          }
          return;
        }

        setCurrentUserId(user.id);

        const { data: currentProfile, error: profileError } = await supabase
          .from('profiles')
          .select('gender')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const expectedGender = currentProfile?.gender === '남성' ? '여성' : '남성';

        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, region, job, introduction, profile_image')
          .eq('gender', expectedGender)
          .neq('id', user.id);

        if (error) {
          throw error;
        }

        const { data: favoriteRows, error: favoritesError } = await supabase
          .from('favorites')
          .select('favorite_user_id')
          .eq('user_id', user.id);

        if (favoritesError) {
          console.error('관심회원 목록 조회 실패:', {
            code: favoritesError.code ?? null,
            message: favoritesError.message ?? null,
            details: favoritesError.details ?? null,
            hint: favoritesError.hint ?? null,
          });
          setToast({ message: '관심회원 상태를 불러오지 못했습니다.', type: 'error' });
        }

        if (isMounted) {
          setMembers(
            ((data as Member[]) ?? []).map((member) => ({
              ...member,
              profile_image: resolveProfileImageUrl(member.profile_image ?? null),
            })),
          );
          setFavoriteIds(new Set((favoritesError ? [] : favoriteRows ?? []).map((row) => row.favorite_user_id)));
        }
      } catch (error: unknown) {
        if (isMounted) {
          console.error('회원 목록 조회 실패:', error);
          setError('회원 목록을 불러오는 중 오류가 발생했습니다.');
          setMembers([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchMembers();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const toggleFavorite = async (event: React.MouseEvent<HTMLButtonElement>, memberId: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (!currentUserId || currentUserId === memberId || togglingFavoriteIds.has(memberId)) return;

    const wasFavorite = favoriteIds.has(memberId);
    setTogglingFavoriteIds((current) => new Set(current).add(memberId));
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

    try {
      const result = wasFavorite
        ? await supabase.from('favorites').delete().eq('user_id', currentUserId).eq('favorite_user_id', memberId)
        : await supabase.from('favorites').insert({ user_id: currentUserId, favorite_user_id: memberId });

      if (result.error) throw result.error;
      setToast({ message: wasFavorite ? '관심회원에서 해제했습니다.' : '관심회원으로 추가했습니다.', type: 'success' });
    } catch (error: unknown) {
      const supabaseError = error as { code?: string; message?: string; details?: string; hint?: string };
      if (!wasFavorite && supabaseError.code === '23505') {
        setFavoriteIds((current) => new Set(current).add(memberId));
        setToast({ message: '이미 관심회원으로 등록되어 있습니다.', type: 'success' });
        return;
      }
      console.error('관심회원 처리 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.add(memberId);
        else next.delete(memberId);
        return next;
      });
      setToast({ message: '관심회원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
    } finally {
      setTogglingFavoriteIds((current) => {
        const next = new Set(current);
        next.delete(memberId);
        return next;
      });
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

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const nickname = (member.nickname || '').toString().toLowerCase();
      const region = (member.region || '').toString();
      const job = (member.job || '').toString();

      const matchesNickname = nickname.includes(searchTerm.toLowerCase());
      const matchesRegion = selectedRegion === '상관없음' || region === selectedRegion;
      const matchesJob = selectedJob === '상관없음'
        || (selectedJob === '기타'
          ? !(STANDARD_JOB_VALUES as readonly string[]).includes(job)
          : job === selectedJob);

      return matchesNickname && matchesRegion && matchesJob;
    });
  }, [members, searchTerm, selectedRegion, selectedJob]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
        <Loader2 className="w-10 h-10 text-[#16a34a] animate-spin mb-4" />
        <p className="text-gray-500 font-medium animate-pulse">회원 목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => router.push('/dashboard')}
          className="mb-6 flex items-center text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
        >
          <span>← Dashboard</span>
        </button>
        <div className="mb-8 sm:mb-10">
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-gray-900">
            회원 둘러보기
            <span className="text-lg font-medium text-[#16a34a]">({members.length})</span>
          </h1>
          <p className="mt-2 text-gray-600">ComMatch에서 활동 중인 멋진 회원들을 만나보세요.</p>
        </div>

        <section className="mb-8 rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">닉네임 검색</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="닉네임으로 검색하세요"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">지역</label>
              <select
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              >
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">직업</label>
              <select
                value={selectedJob}
                onChange={(event) => setSelectedJob(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              >
                {JOBS.map((job) => (
                  <option key={job} value={job}>
                    {job}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">{error}</p>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">아직 등록된 회원이 없습니다.</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMembers.map((member) => (
                <article
                  key={member.id}
                  className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:border-green-500/20 hover:shadow-xl"
                >
                <div className="relative aspect-[4/5] overflow-hidden bg-gray-100">
                  {member.profile_image ? (
                    <img src={member.profile_image} alt={member.nickname ?? '프로필 이미지'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <User size={64} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="absolute left-4 top-4">
                    <span className="rounded-full border border-white/50 bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm backdrop-blur-sm">
                      {member.gender || '미입력'}
                    </span>
                  </div>
                  {currentUserId !== member.id ? (
                    <button
                      type="button"
                      aria-label={favoriteIds.has(member.id) ? '관심회원 해제' : '관심회원 추가'}
                      aria-pressed={favoriteIds.has(member.id)}
                      disabled={togglingFavoriteIds.has(member.id)}
                      onClick={(event) => toggleFavorite(event, member.id)}
                      className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-md backdrop-blur-sm transition hover:scale-105 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Heart size={22} fill={favoriteIds.has(member.id) ? 'currentColor' : 'none'} />
                    </button>
                  ) : null}
                </div>

                <div className="p-6">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <h3 className="truncate text-xl font-bold text-gray-900">
                      {member.nickname || '익명'}
                    </h3>
                    <span className="mb-0.5 text-sm font-semibold text-[#16a34a]">
                      {calculateAge(member.birth_date)}
                    </span>
                  </div>

                  <div className="mb-5 space-y-2">
                    <div className="flex items-center text-sm text-gray-500">
                      <MapPin size={14} className="mr-1.5 text-gray-400" />
                      {member.region || '지역 미설정'}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Briefcase size={14} className="mr-1.5 text-gray-400" />
                      {member.job || '직업 미설정'}
                    </div>
                  </div>

                  <p className="mb-6 min-h-[2.5rem] text-sm leading-relaxed text-gray-600 line-clamp-2">
                    {member.introduction || '자기소개가 아직 없습니다.'}
                  </p>

                  <Button
                    className="w-full rounded-2xl py-3 text-sm font-bold"
                    onClick={() => router.push(`/members/${member.id}`)}
                  >
                    프로필 보기
                  </Button>
                </div>
                </article>
              ))}
            </div>
            <DashboardNavigation />
          </>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
