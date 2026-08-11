'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Cigarette,
  Flag,
  GraduationCap,
  Heart,
  Loader2,
  Palette,
  Quote,
  Ruler,
  Sparkles,
  User,
  Wine,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import Button from '@/components/ui/Button';
import ImageModal from '@/components/common/ImageModal';
import ReportDialog from '@/components/reports/ReportDialog';

type MemberProfile = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  job: string | null;
  region: string | null;
  introduction: string | null;
  education: string | null;
  hobby: string | null;
  drinking: string | null;
  smoking: string | null;
  marriage_history: string | null;
  marriage_values: string | null;
  profile_image?: string | null;
  profile_images?: string[] | null;
};

type Notice = { message: string; type: 'info' | 'success' | 'error' } | null;

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

const getIntroductionPreview = (introduction: string | null) => {
  const text = introduction?.trim();
  if (!text) return '아직 소개 문구를 작성하지 않았습니다.';

  const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= 90) return firstSentence;
  if (text.length <= 90) return text;
  return `${text.slice(0, 87).trimEnd()}...`;
};

const getVisibleProfileValue = (value: string | null) => {
  const normalizedValue = value?.trim() ?? '';
  return normalizedValue && !['미입력', '선택하지 않음', '공개하지 않음'].includes(normalizedValue)
    ? normalizedValue
    : '';
};

const getMarriageHistoryLabel = (value: string | null) => {
  if (value === 'first_marriage') return '초혼';
  if (value === 'remarriage') return '재혼';
  return '정보 미입력';
};

const resolveProfileImageUrls = (profileImage: unknown, profileImages: unknown) => {
  const candidates = [profileImage, ...(Array.isArray(profileImages) ? profileImages : [])];
  const resolvedUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;

    const resolvedUrl = resolveProfileImageUrl(candidate.trim());
    if (!resolvedUrl || seenUrls.has(resolvedUrl)) continue;

    seenUrls.add(resolvedUrl);
    resolvedUrls.push(resolvedUrl);
  }

  return resolvedUrls.slice(0, 5);
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isProfileReported, setIsProfileReported] = useState(false);
  const [hasProfileImageError, setHasProfileImageError] = useState(false);
  const [failedAdditionalImageUrls, setFailedAdditionalImageUrls] = useState<Set<string>>(() => new Set());

  const memberId = useMemo(() => {
    if (typeof params.id === 'string') return params.id;
    if (Array.isArray(params.id) && params.id[0]) return params.id[0];
    return '';
  }, [params.id]);

  useEffect(() => {
    let isMounted = true;

    const fetchMember = async () => {
      if (!memberId) {
        setMember(null);
        setIsNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setMember(null);
      setIsNotFound(false);
      setLoadError(null);
      setNotice(null);
      setIsFavorite(false);
      setSelectedImageUrl(null);
      setIsReportDialogOpen(false);
      setIsProfileReported(false);
      setHasProfileImageError(false);
      setFailedAdditionalImageUrls(new Set());

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          router.replace('/login');
          return;
        }

        if (!isMounted) return;
        setCurrentUserId(user.id);

        const { data, error } = await supabase
          .rpc('get_visible_member_detail', { p_target_user_id: memberId })
          .maybeSingle();

        if (error) throw error;

        const profile = data as MemberProfile | null;
        if (!profile) {
          if (isMounted) setIsNotFound(true);
          return;
        }

        if (isMounted) {
          const profileImageUrls = resolveProfileImageUrls(profile.profile_image, profile.profile_images);

          setMember({
            ...profile,
            profile_image: profileImageUrls[0] ?? null,
            profile_images: profileImageUrls,
          });
        }

        if (user.id !== memberId) {
          const { data: favoriteRow, error: favoriteError } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('favorite_user_id', memberId)
            .maybeSingle();

          if (favoriteError) {
            console.error('관심회원 상태 조회 실패:', {
              code: favoriteError.code ?? null,
              message: favoriteError.message ?? null,
              details: favoriteError.details ?? null,
              hint: favoriteError.hint ?? null,
            });
            if (isMounted) {
              setNotice({ message: '관심회원 상태를 불러오지 못했습니다.', type: 'error' });
            }
          } else if (isMounted) {
            setIsFavorite(Boolean(favoriteRow));
          }
        }
      } catch (error: unknown) {
        const supabaseError = error as { code?: string; message?: string; details?: string; hint?: string };
        console.error('회원 정보 조회 실패:', {
          code: supabaseError.code ?? null,
          message: supabaseError.message ?? null,
          details: supabaseError.details ?? null,
          hint: supabaseError.hint ?? null,
        });
        if (isMounted) {
          setMember(null);
          setLoadError('회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchMember();

    return () => {
      isMounted = false;
    };
  }, [memberId, retryKey, router, supabase]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/members');
  };

  const handleFavoriteToggle = async () => {
    if (!memberId || isTogglingFavorite || currentUserId === memberId) return;

    setIsTogglingFavorite(true);
    setNotice(null);
    const previousFavorite = isFavorite;
    setIsFavorite(!previousFavorite);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setIsFavorite(previousFavorite);
        setNotice({ message: '로그인이 필요합니다.', type: 'error' });
        router.replace('/login');
        return;
      }

      if (previousFavorite) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('favorite_user_id', memberId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('favorites').insert({
          user_id: user.id,
          favorite_user_id: memberId,
        });

        if (error) throw error;
      }

      setNotice({
        message: previousFavorite ? '관심회원에서 해제했습니다.' : '관심회원으로 추가했습니다.',
        type: 'success',
      });
    } catch (error: unknown) {
      const supabaseError = error as { code?: string; message?: string; details?: string; hint?: string };
      if (!previousFavorite && supabaseError.code === '23505') {
        setIsFavorite(true);
        setNotice({ message: '이미 관심회원으로 등록되어 있습니다.', type: 'success' });
        return;
      }
      setIsFavorite(previousFavorite);
      console.error('관심회원 토글 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setNotice({ message: '관심회원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const showComingSoonNotice = (feature: 'like' | 'report') => {
    // 향후 신고 사유: 허위 정보, 부적절한 사진, 욕설, 광고, 사기 의심, 기타
    setNotice({
      message: feature === 'like' ? '좋아요 기능은 도입 예정입니다.' : '신고 기능은 준비 중입니다.',
      type: 'info',
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">회원 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <p className="font-semibold leading-6 text-red-600">{loadError}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" className="flex-1 rounded-2xl py-3 text-sm font-bold" onClick={() => router.push('/members')}>
              회원 목록으로
            </Button>
            <Button className="flex-1 rounded-2xl py-3 text-sm font-bold" onClick={() => setRetryKey((key) => key + 1)}>
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isNotFound || !member) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-[#16a34a]">
            <User size={32} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">존재하지 않는 회원입니다.</h2>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            요청하신 회원을 찾을 수 없거나 이미 탈퇴한 회원일 수 있습니다.
          </p>
          <div className="mt-8 grid gap-3">
            <Button className="w-full rounded-2xl py-3 text-sm font-bold" onClick={() => router.push('/members')}>
              회원 목록으로
            </Button>
            <Button variant="outline" className="w-full rounded-2xl py-3 text-sm font-bold" onClick={() => router.push('/ai-match')}>
              오늘의 추천으로
            </Button>
            <Button variant="outline" className="w-full rounded-2xl py-3 text-sm font-bold" onClick={() => router.push('/dashboard')}>
              대시보드로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const age = calculateAge(member.birth_date);
  const introduction = member.introduction?.trim() || '';
  const introductionText = introduction
    ? `${introduction.slice(0, 500)}${introduction.length > 500 ? '...' : ''}`
    : '아직 자기소개를 작성하지 않았습니다.';
  const visibleSmoking = getVisibleProfileValue(member.smoking);
  const marriageValues = getVisibleProfileValue(member.marriage_values);
  const isOwnProfile = currentUserId === member.id;
  const additionalProfileImages = (member.profile_images ?? [])
    .slice(1)
    .filter((imageUrl) => !failedAdditionalImageUrls.has(imageUrl));

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl pb-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
          >
            <ArrowLeft size={19} /> 뒤로가기
          </button>
          <h1 className="text-lg font-bold text-gray-900 sm:text-xl">회원 프로필</h1>
          {!isOwnProfile ? (
            <button
              type="button"
              disabled={isProfileReported}
              onClick={() => {
                setNotice(null);
                setIsReportDialogOpen(true);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-green-100 disabled:bg-green-50 disabled:text-green-700"
            >
              <Flag size={15} /> {isProfileReported ? '신고 접수됨' : '신고'}
            </button>
          ) : (
            <span className="min-h-11 w-16" aria-hidden="true" />
          )}
        </div>

        <article className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
          <section aria-label="대표 프로필 사진" className="relative bg-[#f0fdf4]">
            <div className="relative flex items-center justify-center overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
              <div className="relative aspect-[3/4] w-full max-w-[400px] overflow-hidden rounded-[1.5rem] bg-[#e8f5e9] shadow-sm">
                {member.profile_image && !hasProfileImageError ? (
                  <button
                    type="button"
                    aria-label={`${member.nickname ?? '회원'} 프로필 사진 크게 보기`}
                    onClick={() => setSelectedImageUrl(member.profile_image ?? null)}
                    className="absolute inset-0 h-full w-full cursor-zoom-in focus:outline-none focus:ring-4 focus:ring-inset focus:ring-green-300"
                  >
                    <img
                      src={member.profile_image}
                      alt={member.nickname ?? '프로필 이미지'}
                      onError={() => setHasProfileImageError(true)}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <div className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-white bg-white shadow-md">
                      <User size={72} strokeWidth={1.5} />
                    </div>
                  </div>
                )}
              </div>
              {member.profile_image && !hasProfileImageError ? (
                <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm">
                  대표사진
                </span>
              ) : null}
            </div>
            {additionalProfileImages.length > 0 ? (
              <div className="border-t border-green-100 bg-white/80 px-5 py-4 sm:px-6">
                <div className="mx-auto grid max-w-[400px] grid-cols-2 gap-3 sm:grid-cols-4">
                  {additionalProfileImages.map((imageUrl, index) => (
                    <button
                      key={imageUrl}
                      type="button"
                      aria-label={`${member.nickname ?? '회원'}의 프로필 사진 ${index + 2} 크게 보기`}
                      onClick={() => setSelectedImageUrl(imageUrl)}
                      className="aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8f5e9] shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-300"
                    >
                      <img
                        src={imageUrl}
                        alt={`${member.nickname ?? '회원'} 프로필 사진 ${index + 2}`}
                        onError={() => {
                          setFailedAdditionalImageUrls((currentUrls) => {
                            const nextUrls = new Set(currentUrls);
                            nextUrls.add(imageUrl);
                            return nextUrls;
                          });
                        }}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <div className="space-y-10 p-6 sm:p-10 md:p-12">
            <section aria-labelledby="basic-profile-heading">
              <div className="flex flex-col gap-5 border-b border-gray-100 pb-8 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="basic-profile-heading" className="text-3xl font-black text-gray-900 sm:text-4xl">
                    {member.nickname || '익명'}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold text-[#16a34a] sm:text-lg">
                    <span>{age !== null ? `만 ${age}세` : '나이 정보 미입력'}</span>
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    <span>{member.region || '지역 정보 미입력'}</span>
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    <span>{member.job || '직업 정보 미입력'}</span>
                  </div>
                </div>
                {isOwnProfile ? (
                  <Button className="rounded-2xl px-5 py-3 text-sm font-bold" onClick={() => router.push('/profile/create')}>
                    내 프로필 수정
                  </Button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ProfileFact icon={<User size={18} />} label="성별" value={member.gender || '정보 미입력'} />
                <ProfileFact icon={<Ruler size={18} />} label="키" value={member.height ? `${member.height}cm` : '정보 미입력'} />
                <ProfileFact icon={<GraduationCap size={18} />} label="학력" value={member.education || '정보 미입력'} />
                <ProfileFact icon={<Heart size={18} />} label="결혼 이력" value={getMarriageHistoryLabel(member.marriage_history)} />
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-green-100 bg-green-50 p-6 sm:p-8" aria-labelledby="short-introduction-heading">
              <h2 id="short-introduction-heading" className="text-sm font-bold text-green-800">한 줄 소개</h2>
              <p className="mt-3 text-lg font-semibold leading-8 text-gray-800 sm:text-xl">
                “{getIntroductionPreview(member.introduction)}”
              </p>
            </section>

            <section aria-labelledby="introduction-heading">
              <h2 id="introduction-heading" className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <Quote className="text-[#16a34a]" size={22} /> 자기소개
              </h2>
              <div className="mt-4 rounded-[1.75rem] bg-gray-50 p-6 sm:p-8">
                <p className="whitespace-pre-wrap break-words text-base leading-8 text-gray-700">{introductionText}</p>
              </div>
            </section>

            <section aria-labelledby="lifestyle-heading">
              <h2 id="lifestyle-heading" className="text-xl font-bold text-gray-900">생활 스타일</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ProfileFact icon={<Palette size={18} />} label="취미" value={member.hobby || '정보 미입력'} />
                <ProfileFact icon={<Wine size={18} />} label="음주 여부" value={member.drinking || '정보 미입력'} />
                <ProfileFact icon={<Cigarette size={18} />} label="흡연 여부" value={visibleSmoking || '정보 없음'} />
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-gray-200 bg-gray-50 p-6 sm:p-8" aria-labelledby="marriage-values-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="marriage-values-heading" className="text-xl font-bold text-gray-700">결혼 가치관</h2>
                {!marriageValues ? (
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-500">정보 없음</span>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                {marriageValues || '등록된 결혼 가치관 정보가 없습니다.'}
              </p>
            </section>

            <section className="rounded-[1.75rem] border border-dashed border-gray-200 bg-white p-6 sm:p-8" aria-labelledby="ai-summary-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="ai-summary-heading" className="flex items-center gap-2 text-xl font-bold text-gray-700">
                  <Sparkles size={21} className="text-gray-400" /> 맞춤 분석 요약
                </h2>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">추천 화면 제공</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-500">
                입력된 프로필과 이상형 조건을 바탕으로 한 맞춤 분석은 추천 화면에서 확인할 수 있습니다.
              </p>
            </section>
          </div>
        </article>

        <div className="sticky bottom-4 z-30 mt-6 rounded-[1.75rem] border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
          {notice ? (
            <div
              role="status"
              className={`mb-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                notice.type === 'error'
                  ? 'border-red-100 bg-red-50 text-red-600'
                  : notice.type === 'success'
                    ? 'border-green-100 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              {notice.message}
            </div>
          ) : null}
          {isOwnProfile ? (
            <Button className="w-full rounded-2xl py-3 text-sm font-bold" onClick={() => router.push('/profile/create')}>
              내 프로필 수정
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant={isFavorite ? 'primary' : 'outline'}
                className="min-h-12 rounded-2xl py-3 text-sm font-bold"
                onClick={handleFavoriteToggle}
                disabled={isTogglingFavorite}
              >
                <Heart className="mr-2 h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
                {isTogglingFavorite ? '처리 중...' : isFavorite ? '관심 취소' : '관심'}
              </Button>
              <button
                type="button"
                onClick={() => showComingSoonNotice('like')}
                className="min-h-12 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-3 text-sm font-bold text-gray-500 transition hover:bg-gray-100"
              >
                좋아요 · 도입 예정
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedImageUrl ? (
        <ImageModal
          key={selectedImageUrl}
          isOpen
          imageUrl={selectedImageUrl}
          alt={`${member.nickname ?? '회원'} 프로필 사진`}
          onClose={() => setSelectedImageUrl(null)}
        />
      ) : null}
      <ReportDialog
        open={isReportDialogOpen}
        target={!isOwnProfile ? {
          type: 'profile',
          targetUserId: member.id,
          targetLabel: member.nickname ?? undefined,
        } : null}
        onClose={() => setIsReportDialogOpen(false)}
        onSuccess={() => {
          setIsProfileReported(true);
          setNotice({ message: '신고가 접수되었습니다.', type: 'success' });
        }}
      />
    </div>
  );
}

function ProfileFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="rounded-xl bg-green-50 p-2 text-[#16a34a]">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400">{label}</p>
        <p className="mt-1 break-words text-sm font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}
