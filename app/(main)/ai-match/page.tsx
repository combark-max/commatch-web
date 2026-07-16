'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Loader2, MapPin, Ruler, Sparkles, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { STANDARD_JOB_VALUES } from '@/constants/jobs';

type Profile = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  profile_image: string | null;
};

type Preference = {
  age_min: number | null;
  age_max: number | null;
  height_min: number | null;
  height_max: number | null;
  preferred_region: string | null;
  preferred_job: string | null;
};

type RecommendedMember = Profile & {
  age: number | null;
  score: number;
};

type SetupTarget = 'profile' | 'preference' | null;

const calculateAge = (birthDate: string | null) => {
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

const isSpecified = (value: string | null) => Boolean(value && value !== '상관없음');

const matchesPreferredJob = (job: string | null, preferredJob: string | null) => {
  if (!isSpecified(preferredJob) || !job) return false;
  if (preferredJob === '기타') {
    return !(STANDARD_JOB_VALUES as readonly string[]).includes(job);
  }
  return job === preferredJob;
};

export default function AiMatchPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedMember[]>([]);
  const [setupTarget, setSetupTarget] = useState<SetupTarget>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRecommendations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          router.replace('/login');
          return;
        }

        const [profileResult, preferenceResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, nickname, birth_date, gender, height, region, job, profile_image')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('preferences')
            .select('age_min, age_max, height_min, height_max, preferred_region, preferred_job')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (preferenceResult.error) throw preferenceResult.error;

        const currentProfile = profileResult.data as Profile | null;
        const preference = preferenceResult.data as Preference | null;

        if (!currentProfile?.gender || !['남성', '여성'].includes(currentProfile.gender)) {
          if (isMounted) setSetupTarget('profile');
          return;
        }

        if (!preference) {
          if (isMounted) setSetupTarget('preference');
          return;
        }

        const oppositeGender = currentProfile.gender === '남성' ? '여성' : '남성';
        const { data, error: membersError } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, region, job, profile_image')
          .eq('gender', oppositeGender)
          .neq('id', user.id);

        if (membersError) throw membersError;

        const scoredMembers = ((data as Profile[]) ?? [])
          .map((member) => {
            const age = calculateAge(member.birth_date);
            let score = 0;

            const hasAgePreference = preference.age_min !== null || preference.age_max !== null;
            const matchesAge = age !== null
              && (preference.age_min === null || age >= preference.age_min)
              && (preference.age_max === null || age <= preference.age_max);
            if (hasAgePreference && matchesAge) score += 1;

            const hasHeightPreference = preference.height_min !== null || preference.height_max !== null;
            const matchesHeight = member.height !== null
              && (preference.height_min === null || member.height >= preference.height_min)
              && (preference.height_max === null || member.height <= preference.height_max);
            if (hasHeightPreference && matchesHeight) score += 1;

            if (isSpecified(preference.preferred_region) && member.region === preference.preferred_region) {
              score += 1;
            }

            if (matchesPreferredJob(member.job, preference.preferred_job)) {
              score += 1;
            }

            return {
              ...member,
              age,
              score,
              profile_image: resolveProfileImageUrl(member.profile_image),
            };
          })
          .filter((member) => member.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        if (isMounted) {
          setRecommendations(scoredMembers);
          setSetupTarget(null);
        }
      } catch (loadError) {
        console.error('AI 추천 회원 조회 실패:', loadError);
        if (isMounted) {
          setRecommendations([]);
          setError('추천 회원을 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">AI 추천</h1>
          <p className="mt-2 text-gray-600">AI가 추천하는 회원을 확인할 수 있는 화면입니다.</p>
        </div>

        {isLoading ? (
          <div className="flex min-h-64 flex-col items-center justify-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
            <p className="font-medium text-gray-500">추천 회원을 찾는 중...</p>
          </div>
        ) : setupTarget ? (
          <div className="rounded-[1.75rem] border border-green-100 bg-green-50 p-8 text-center">
            <Sparkles className="mx-auto mb-4 h-10 w-10 text-[#16a34a]" />
            <p className="mb-6 font-semibold text-gray-700">
              {setupTarget === 'profile'
                ? 'AI 추천을 받으려면 먼저 프로필을 설정해 주세요.'
                : 'AI 추천을 받으려면 먼저 이상형을 설정해 주세요.'}
            </p>
            <Button
              className="rounded-2xl px-6 py-3 text-sm font-bold"
              onClick={() => router.push(setupTarget === 'profile' ? '/profile/create' : '/preference')}
            >
              {setupTarget === 'profile' ? '프로필 설정하기' : '이상형 설정하기'}
            </Button>
          </div>
        ) : error ? (
          <div className="rounded-[1.75rem] border border-red-100 bg-red-50 p-8 text-center text-sm font-medium text-red-600">
            {error}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="rounded-[1.75rem] border border-gray-100 bg-gray-50 p-12 text-center">
            <p className="font-semibold text-gray-600">조건에 맞는 추천 회원이 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {recommendations.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => router.push(`/members/${member.id}`)}
                className="overflow-hidden rounded-[1.75rem] border border-gray-100 bg-white text-left shadow-sm transition hover:border-green-200 hover:shadow-lg"
              >
                <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                  {member.profile_image ? (
                    <img
                      src={member.profile_image}
                      alt={`${member.nickname ?? '회원'} 프로필 사진`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <User size={64} strokeWidth={1.5} />
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{member.nickname || '닉네임 미설정'}</h2>
                      <p className="mt-1 text-sm font-semibold text-[#16a34a]">
                        {member.age !== null ? `${member.age}세` : '나이 미설정'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                      추천 점수 {member.score}점
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-500">
                    <p className="flex items-center gap-2">
                      <MapPin size={15} className="text-gray-400" />
                      {member.region || '지역 미설정'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Briefcase size={15} className="text-gray-400" />
                      {member.job || '직업 미설정'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Ruler size={15} className="text-gray-400" />
                      {member.height !== null ? `${member.height}cm` : '키 미설정'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
