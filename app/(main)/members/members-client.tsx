"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import {
  parseAdvancedSearchMembers,
  type AdvancedSearchMember,
} from '@/lib/member/advanced-search-parser';
import { REGIONS } from '@/constants/regions';
import { JOBS, STANDARD_JOB_VALUES } from '@/constants/jobs';
import { User, MapPin, Briefcase, Heart, Loader2, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

type Member = AdvancedSearchMember;

type AdvancedSearchState =
  | { status: 'idle'; requestKey: null; members: null }
  | { status: 'loading'; requestKey: string; members: null }
  | { status: 'success'; requestKey: string; members: Member[] }
  | { status: 'error'; requestKey: string; members: null; message: string };

const EMPTY_MEMBERS: Member[] = [];

const EDUCATION_OPTIONS = ['전체', '고졸', '전문대졸', '대졸', '석사', '박사'] as const;
const DRINKING_OPTIONS = ['전체', '전혀 안 함', '가끔 함', '자주 함'] as const;

type MembersClientProps = {
  canUseAdvancedSearch: boolean;
  initialAdvancedOpen: boolean;
};

export default function MembersClient({
  canUseAdvancedSearch,
  initialAdvancedOpen,
}: MembersClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [advancedSearchState, setAdvancedSearchState] = useState<AdvancedSearchState>({
    status: 'idle',
    requestKey: null,
    members: null,
  });
  const [advancedRetryToken, setAdvancedRetryToken] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [togglingFavoriteIds, setTogglingFavoriteIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('상관없음');
  const [selectedJob, setSelectedJob] = useState('상관없음');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [isAdvancedOpen] = useState(initialAdvancedOpen);
  const [heightMin, setHeightMin] = useState('');
  const [heightMax, setHeightMax] = useState('');
  const [selectedEducation, setSelectedEducation] = useState('전체');
  const [selectedDrinking, setSelectedDrinking] = useState('전체');
  const [hobbySearch, setHobbySearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const advancedSearchRequestRef = useRef(0);

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

        const { data, error } = await supabase.rpc('get_visible_member_summaries');

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
            ((data as Member[]) ?? [])
              .filter((member) => member.gender === expectedGender && member.id !== user.id)
              .map((member) => ({
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

  const ageFilterError = useMemo(() => {
    const parsedMin = ageMin === '' ? null : Number(ageMin);
    const parsedMax = ageMax === '' ? null : Number(ageMax);

    if ((parsedMin !== null && (!Number.isInteger(parsedMin) || parsedMin < 0))
      || (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 0))) {
      return '나이는 0 이상의 정수로 입력해주세요.';
    }

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      return '최소 나이는 최대 나이보다 클 수 없습니다.';
    }

    return null;
  }, [ageMin, ageMax]);

  const heightFilterError = useMemo(() => {
    const parsedMin = heightMin === '' ? null : Number(heightMin);
    const parsedMax = heightMax === '' ? null : Number(heightMax);

    if ((parsedMin !== null && (!Number.isInteger(parsedMin) || parsedMin < 0))
      || (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 0))) {
      return '키는 0 이상의 정수로 입력해주세요.';
    }

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      return '최소 키는 최대 키보다 클 수 없습니다.';
    }

    return null;
  }, [heightMin, heightMax]);

  const hasAdvancedFilters = heightMin !== ''
    || heightMax !== ''
    || selectedEducation !== '전체'
    || selectedDrinking !== '전체'
    || hobbySearch.trim() !== '';

  const shouldRunAdvancedSearch = canUseAdvancedSearch
    && hasAdvancedFilters
    && !heightFilterError;
  const advancedRequestKey = useMemo(() => JSON.stringify([
    heightMin,
    heightMax,
    selectedEducation,
    selectedDrinking,
    hobbySearch.trim(),
    advancedRetryToken,
  ]), [
    heightMin,
    heightMax,
    selectedEducation,
    selectedDrinking,
    hobbySearch,
    advancedRetryToken,
  ]);

  const currentAdvancedSearchState: AdvancedSearchState = !shouldRunAdvancedSearch
    ? { status: 'idle', requestKey: null, members: null }
    : advancedSearchState.requestKey === advancedRequestKey
      ? advancedSearchState
      : { status: 'loading', requestKey: advancedRequestKey, members: null };

  useEffect(() => {
    const requestId = advancedSearchRequestRef.current + 1;
    advancedSearchRequestRef.current = requestId;

    if (!shouldRunAdvancedSearch) {
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      const fetchAdvancedMembers = async () => {
        if (isCancelled || advancedSearchRequestRef.current !== requestId) return;
        setAdvancedSearchState({
          status: 'loading',
          requestKey: advancedRequestKey,
          members: null,
        });

        try {
          const { data, error: advancedSearchError } = await supabase.rpc('search_members_advanced', {
            p_height_min: heightMin === '' ? null : Number(heightMin),
            p_height_max: heightMax === '' ? null : Number(heightMax),
            p_education: selectedEducation === '전체' ? null : selectedEducation,
            p_drinking: selectedDrinking === '전체' ? null : selectedDrinking,
            p_hobby: hobbySearch.trim() || null,
          });

          if (isCancelled || advancedSearchRequestRef.current !== requestId) return;

          if (advancedSearchError) {
            console.error('고급 회원 검색 실패:', {
              code: advancedSearchError.code ?? null,
              message: advancedSearchError.message ?? null,
              details: advancedSearchError.details ?? null,
              hint: advancedSearchError.hint ?? null,
            });
            setAdvancedSearchState({
              status: 'error',
              requestKey: advancedRequestKey,
              members: null,
              message: '고급 검색 결과를 불러오지 못했습니다.',
            });
            setToast({ message: '고급 검색 결과를 불러오지 못했습니다.', type: 'error' });
            return;
          }

          const parsedMembers = parseAdvancedSearchMembers(data);
          if (parsedMembers === null) {
            console.error('고급 회원 검색 응답 형식이 올바르지 않습니다.');
            setAdvancedSearchState({
              status: 'error',
              requestKey: advancedRequestKey,
              members: null,
              message: '고급 검색 결과를 불러오지 못했습니다.',
            });
            setToast({ message: '고급 검색 결과를 불러오지 못했습니다.', type: 'error' });
            return;
          }

          setAdvancedSearchState({
            status: 'success',
            requestKey: advancedRequestKey,
            members: parsedMembers.map((member) => ({
              ...member,
              profile_image: resolveProfileImageUrl(member.profile_image ?? null),
            })),
          });
        } catch (advancedSearchError: unknown) {
          if (isCancelled || advancedSearchRequestRef.current !== requestId) return;
          console.error('고급 회원 검색 중 예기치 않은 오류가 발생했습니다.', advancedSearchError);
          setAdvancedSearchState({
            status: 'error',
            requestKey: advancedRequestKey,
            members: null,
            message: '고급 검색 결과를 불러오지 못했습니다.',
          });
          setToast({ message: '고급 검색 결과를 불러오지 못했습니다.', type: 'error' });
        }
      };

      void fetchAdvancedMembers();
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    shouldRunAdvancedSearch,
    advancedRequestKey,
    heightMin,
    heightMax,
    selectedEducation,
    selectedDrinking,
    hobbySearch,
    supabase,
  ]);

  const searchableMembers = currentAdvancedSearchState.status === 'success'
    ? currentAdvancedSearchState.members
    : shouldRunAdvancedSearch
      ? EMPTY_MEMBERS
      : members;

  const filteredMembers = useMemo(() => {
    return searchableMembers.filter((member) => {
      const nickname = (member.nickname || '').toString().toLowerCase();
      const region = (member.region || '').toString();
      const job = (member.job || '').toString();

      const matchesNickname = nickname.includes(searchTerm.toLowerCase());
      const matchesRegion = selectedRegion === '상관없음' || region === selectedRegion;
      const matchesJob = selectedJob === '상관없음'
        || (selectedJob === '기타'
          ? !(STANDARD_JOB_VALUES as readonly string[]).includes(job)
          : job === selectedJob);
      const memberAge = member.age;
      const parsedMin = ageMin === '' ? null : Number(ageMin);
      const parsedMax = ageMax === '' ? null : Number(ageMax);
      const matchesAge = ageFilterError !== null
        || ((parsedMin === null && parsedMax === null)
          || (memberAge !== null
            && (parsedMin === null || memberAge >= parsedMin)
            && (parsedMax === null || memberAge <= parsedMax)));

      return matchesNickname
        && matchesRegion
        && matchesJob
        && matchesAge;
    });
  }, [
    searchableMembers,
    searchTerm,
    selectedRegion,
    selectedJob,
    ageMin,
    ageMax,
    ageFilterError,
  ]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedRegion('상관없음');
    setSelectedJob('상관없음');
    setAgeMin('');
    setAgeMax('');
    setHeightMin('');
    setHeightMax('');
    setSelectedEducation('전체');
    setSelectedDrinking('전체');
    setHobbySearch('');
    setAdvancedSearchState({ status: 'idle', requestKey: null, members: null });
    setAdvancedRetryToken(0);
  };

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
        <div className="mb-8 sm:mb-10">
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-gray-900">
            회원 둘러보기
          </h1>
          <p className="mt-2 text-gray-600">ComMatch에서 활동 중인 멋진 회원들을 만나보세요.</p>
        </div>

        <section className="mb-8 rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
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

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">나이</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={ageMin}
                  onChange={(event) => setAgeMin(event.target.value)}
                  placeholder="최소 나이"
                  aria-label="최소 나이"
                  className="min-w-0 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={ageMax}
                  onChange={(event) => setAgeMax(event.target.value)}
                  placeholder="최대 나이"
                  aria-label="최대 나이"
                  className="min-w-0 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <Link
              href="/premium#premium-benefits"
              className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-bold text-green-700 transition hover:text-green-800"
            >
              고급검색은 Premium 혜택에서 이용할 수 있습니다.
            </Link>
          </div>

          {isAdvancedOpen ? (
            <div id="advanced-member-search" className="mt-4 rounded-2xl border border-green-100 bg-green-50/50 p-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">고급 회원 검색</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  키, 학력, 음주 여부와 취미 조건으로 회원을 더 세밀하게 찾아볼 수 있습니다.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">키</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={heightMin}
                      onChange={(event) => setHeightMin(event.target.value)}
                      placeholder="최소 키"
                      aria-label="최소 키"
                      className="min-w-0 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    />
                    <span className="text-gray-400">~</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={heightMax}
                      onChange={(event) => setHeightMax(event.target.value)}
                      placeholder="최대 키"
                      aria-label="최대 키"
                      className="min-w-0 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">학력</label>
                  <select
                    value={selectedEducation}
                    onChange={(event) => setSelectedEducation(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  >
                    {EDUCATION_OPTIONS.map((education) => <option key={education} value={education}>{education}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">음주 여부</label>
                  <select
                    value={selectedDrinking}
                    onChange={(event) => setSelectedDrinking(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  >
                    {DRINKING_OPTIONS.map((drinking) => <option key={drinking} value={drinking}>{drinking}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">취미</label>
                  <input
                    type="text"
                    value={hobbySearch}
                    onChange={(event) => setHobbySearch(event.target.value)}
                    placeholder="취미를 입력하세요"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="space-y-1 text-sm text-red-600">
              {ageFilterError ? <p>{ageFilterError}</p> : null}
              {heightFilterError ? <p>{heightFilterError}</p> : null}
            </div>
            <Button type="button" variant="outline" onClick={resetFilters} className="shrink-0 rounded-2xl px-5 py-2.5 text-sm font-bold">
              검색 초기화
            </Button>
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">{error}</p>
          </div>
        ) : currentAdvancedSearchState.status === 'loading' ? (
          <div className="rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-sm">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
            <p className="text-lg font-medium text-gray-500">고급 검색 결과를 불러오는 중...</p>
          </div>
        ) : currentAdvancedSearchState.status === 'error' ? (
          <div className="rounded-3xl border border-red-100 bg-white py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-12 w-12 text-red-200" />
            <p className="text-lg font-medium text-gray-700">{currentAdvancedSearchState.message}</p>
            <p className="mt-2 text-sm text-gray-500">조건을 변경하거나 다시 시도해주세요.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdvancedRetryToken((current) => current + 1)}
              className="mt-5 rounded-2xl px-5 py-2.5 text-sm font-bold"
            >
              다시 시도
            </Button>
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
                      {member.age === null ? '' : `${member.age}세`}
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
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
