"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import {
  User, MapPin, Briefcase, GraduationCap,
  Church, Palette, Ruler, Quote, Heart, Loader2
} from 'lucide-react';
import Button from '@/components/ui/Button';
import ImageModal from '@/components/common/ImageModal';

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
  religion: string | null;
  hobby: string | null;
  drinking: string | null;
  profile_image?: string | null;
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [hasProfileImageError, setHasProfileImageError] = useState(false);
  const supabase = createClient();

  const memberId = useMemo(() => {
    if (typeof params.id === 'string') return params.id;
    if (Array.isArray(params.id) && params.id[0]) return params.id[0];
    return '';
  }, [params.id]);

  useEffect(() => {
    const fetchMember = async () => {
      if (!memberId) {
        setMember(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFavoriteError(null);
      setIsImageModalOpen(false);
      setHasProfileImageError(false);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, job, region, introduction, education, religion, hobby, drinking, profile_image')
          .eq('id', memberId)
          .maybeSingle();

        if (error) {
          console.error('회원 정보 조회 실패:', error);
          setMember(null);
        } else {
          const profile = data as MemberProfile | null;
          setMember(profile ? {
            ...profile,
            profile_image: resolveProfileImageUrl(profile.profile_image ?? null),
          } : null);
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          router.replace('/login');
          return;
        }

        setCurrentUserId(user.id);
        if (user.id !== memberId) {
          const { data: favoriteRows, error: favoriteError } = await supabase
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
            setFavoriteError('관심회원 상태를 불러오지 못했습니다.');
          } else {
            setIsFavorite(Boolean(favoriteRows));
          }
        }
      } catch (error) {
        console.error('데이터 fetching 중 오류:', error);
        setMember(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMember();
  }, [memberId, router, supabase]);

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

  const handleFavoriteToggle = async () => {
    if (!memberId || isTogglingFavorite || currentUserId === memberId) return;

    setIsTogglingFavorite(true);
    setFavoriteError(null);
    const previousFavorite = isFavorite;
    setIsFavorite(!previousFavorite);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setIsFavorite(previousFavorite);
        setFavoriteError('로그인이 필요합니다.');
        router.replace('/login');
        return;
      }

      if (previousFavorite) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('favorite_user_id', memberId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from('favorites').insert({
          user_id: user.id,
          favorite_user_id: memberId,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error: unknown) {
      const supabaseError = error as { code?: string; message?: string; details?: string; hint?: string };
      if (!previousFavorite && supabaseError.code === '23505') {
        setIsFavorite(true);
        return;
      }
      setIsFavorite(previousFavorite);
      console.error('관심회원 토글 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setFavoriteError('관심회원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">회원 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-[#16a34a]">
            <User size={32} strokeWidth={1.5} />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-gray-900">존재하지 않는 회원입니다.</h2>
          <p className="mb-8 text-sm leading-6 text-gray-500">
            요청하신 회원을 찾을 수 없거나 이미 탈퇴한 회원일 수 있습니다.
          </p>
          <Button
            className="w-full rounded-2xl py-3 text-sm font-bold"
            onClick={() => router.push('/members')}
          >
            회원목록으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-end">
          <button
            onClick={() => router.push('/members')}
            className="flex items-center text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
          >
            <span>회원목록으로</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-xl">
          <div className="relative flex h-64 items-center justify-center border-b border-gray-50 bg-[#f0fdf4]">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-gray-300 shadow-md">
              {member.profile_image && !hasProfileImageError ? (
                <button
                  type="button"
                  aria-label={`${member.nickname ?? '회원'} 프로필 사진 크게 보기`}
                  onClick={() => setIsImageModalOpen(true)}
                  className="h-full w-full cursor-pointer overflow-hidden rounded-full focus:outline-none focus:ring-4 focus:ring-green-300"
                >
                  <img
                    src={member.profile_image}
                    alt={member.nickname ?? '프로필 이미지'}
                    onError={() => setHasProfileImageError(true)}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                </button>
              ) : (
                <User size={64} strokeWidth={1.5} />
              )}
              </div>
              {member.profile_image && !hasProfileImageError ? (
                <p className="text-xs font-medium text-gray-500">사진을 클릭하면 크게 볼 수 있습니다.</p>
              ) : null}
            </div>
            <div className="absolute right-6 top-6">
              <span className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white shadow-lg">
                {member.gender || '미입력'}
              </span>
            </div>
          </div>

          <div className="p-8 md:p-12">
            <div className="mb-8 flex flex-col gap-4 border-b border-gray-50 pb-8 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="mb-2 text-4xl font-black text-gray-900">
                  {member.nickname || '익명'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-lg font-semibold text-[#16a34a]">
                  <span>{calculateAge(member.birth_date)}</span>
                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                  <span>{member.region || '지역 미설정'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="rounded-2xl px-6 py-3 text-sm font-bold"
                  onClick={() => router.push('/members')}
                >
                  회원목록으로
                </Button>
                {currentUserId !== member.id ? <Button
                  className="rounded-2xl px-6 py-3 text-sm font-bold"
                  onClick={handleFavoriteToggle}
                  disabled={isTogglingFavorite}
                >
                  <Heart className="mr-2 h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
                  {isTogglingFavorite ? '처리 중...' : isFavorite ? '관심회원 해제' : '관심회원 추가'}
                </Button> : null}
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoItem icon={<User size={20} />} label="성별" value={member.gender} />
              <InfoItem icon={<Briefcase size={20} />} label="직업" value={member.job} />
              <InfoItem icon={<Ruler size={20} />} label="키" value={member.height ? `${member.height}cm` : null} />
              <InfoItem icon={<GraduationCap size={20} />} label="학력" value={member.education} />
              <InfoItem icon={<Church size={20} />} label="종교" value={member.religion} />
              <InfoItem icon={<Palette size={20} />} label="취미" value={member.hobby} />
              <InfoItem icon={<MapPin size={20} />} label="지역" value={member.region} />
              <InfoItem icon={<User size={20} />} label="음주" value={member.drinking} />
            </div>

            {favoriteError ? (
              <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                {favoriteError}
              </div>
            ) : null}

            <div className="relative rounded-[2rem] bg-gray-50 p-8 md:p-10">
              <Quote className="absolute left-6 top-6 -z-0 h-12 w-12 text-green-200" />
              <div className="relative z-10">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                  <span className="h-6 w-1.5 rounded-full bg-[#16a34a]" />
                  자기소개
                </h3>
                <p className="whitespace-pre-wrap text-lg leading-loose text-gray-600">
                  {member.introduction || '등록된 자기소개가 없습니다.'}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
      <ImageModal
        isOpen={isImageModalOpen}
        imageUrl={member.profile_image ?? null}
        alt={`${member.nickname ?? '회원'} 프로필 사진`}
        onClose={() => setIsImageModalOpen(false)}
      />
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="mt-1 rounded-xl bg-green-50 p-2 text-[#16a34a]">
        {icon}
      </div>
      <div>
        <p className="mb-1 text-sm font-bold text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value || '미설정'}</p>
      </div>
    </div>
  );
}
