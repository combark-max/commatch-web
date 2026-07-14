"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Heart, Users, Calendar, MapPin, Ruler, Briefcase, Quote, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { JOBS } from "@/constants/jobs";
import { REGIONS } from "@/constants/regions";
import DashboardNavigation from '@/components/common/DashboardNavigation';

export default function PreferencePage() {
  // 컴포넌트 내부에서 매번 클라이언트를 생성하지 않도록 useMemo 사용 또는 안정화
  const supabase = useMemo(() => createClient(), []);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPreferences, setIsFetchingPreferences] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State integration
  const [preferredGender, setPreferredGender] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [heightMin, setHeightMin] = useState("");
  const [heightMax, setHeightMax] = useState("");
  const [preferredJob, setPreferredJob] = useState("");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [introduction, setIntroduction] = useState("");

  useEffect(() => {
    const loadPreferences = async () => {
      setIsFetchingPreferences(true);
      setError(null);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          setError('로그인이 필요합니다.');
          return;
        }

        const { data, error: preferenceError } = await supabase
          .from('preferences')
          .select('preferred_gender, age_min, age_max, height_min, height_max, preferred_job, preferred_region, introduction')
          .eq('user_id', user.id)
          .maybeSingle();

        if (preferenceError) {
          throw preferenceError;
        }

        if (data) {
          setPreferredGender(data.preferred_gender ?? '');
          setAgeMin(data.age_min ? String(data.age_min) : '');
          setAgeMax(data.age_max ? String(data.age_max) : '');
          setHeightMin(data.height_min ? String(data.height_min) : '');
          setHeightMax(data.height_max ? String(data.height_max) : '');
          setPreferredJob(data.preferred_job ?? '');
          setPreferredRegion(data.preferred_region ?? '');
          setIntroduction(data.introduction ?? '');
        }
      } catch (error) {
        console.error('이상형 조회 실패:', error);
        setError('이상형 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsFetchingPreferences(false);
      }
    };

    loadPreferences();
  }, [supabase]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('로그인이 필요합니다.');
        return;
      }

      const result = await supabase.from("preferences").upsert(
        {
          user_id: user.id,
          preferred_gender: preferredGender,
          age_min: ageMin ? parseInt(ageMin) : null,
          age_max: ageMax ? parseInt(ageMax) : null,
          height_min: heightMin ? parseInt(heightMin) : null,
          height_max: heightMax ? parseInt(heightMax) : null,
          preferred_job: preferredJob,
          preferred_region: preferredRegion,
          introduction: introduction,
        },
        { onConflict: "user_id" }
      );

      const { error } = result;
      console.log("Upsert Result:", result);

      if (error) {
        throw error;
      } else {
        setError(null);
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      }
    } catch (error) {
      console.error('이상형 저장 실패:', error);
      setError('저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetchingPreferences) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">이상형 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
              <Heart className="w-8 h-8 text-[#16a34a]" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">이상형 정보 설정</h1>
          <p className="mt-2 text-gray-600">당신이 꿈꾸는 이상형의 조건을 알려주세요.</p>
        </div>

        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preferred Gender */}
            <div className="md:col-span-2">
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Users size={16} className="mr-2 text-[#16a34a]" />
                희망 성별
              </label>
              <div className="flex gap-4">
                {/* 요구사항: "상관없음" 항목 제거 */}
                {["남성", "여성"].map((gender) => (
                  <label key={gender} className="flex-1">
                    <input
                      type="radio"
                      name="pref_gender"
                      value={gender}
                      checked={preferredGender === gender}
                      onChange={(e) => setPreferredGender(e.target.value)}
                      className="sr-only peer"
                    />
                    <div className="w-full text-center py-2.5 border border-gray-300 rounded-lg cursor-pointer peer-checked:border-[#16a34a] peer-checked:bg-green-50 peer-checked:text-[#16a34a] transition-all hover:border-gray-400">
                      {gender}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Preferred Age Range */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Calendar size={16} className="mr-2 text-[#16a34a]" />
                희망 나이
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
              </div>
            </div>

            {/* Preferred Height Range */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Ruler size={16} className="mr-2 text-[#16a34a]" />
                희망 키 (cm)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={heightMin}
                  onChange={(e) => setHeightMin(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={heightMax}
                  onChange={(e) => setHeightMax(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
              </div>
            </div>

            {/* Preferred Job */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Briefcase size={16} className="mr-2 text-[#16a34a]" />
                희망 직업
              </label>
              <select
                value={preferredJob}
                onChange={(e) => setPreferredJob(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              >
                <option value="">선택해주세요</option>
                {JOBS.map((job) => (
                  <option key={job} value={job}>
                    {job}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred Region */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <MapPin size={16} className="mr-2 text-[#16a34a]" />
                희망 지역
              </label>
              <select
                value={preferredRegion}
                onChange={(e) => setPreferredRegion(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              >
                <option value="">선택해주세요</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ideal Description */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              <Quote size={16} className="mr-2 text-[#16a34a]" />
              이상형 한줄 설명
            </label>
            <textarea
              rows={3}
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              placeholder="추가적으로 바라는 이상형의 모습을 자유롭게 적어주세요."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            ></textarea>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="pt-6">
            <Button type="submit" className="w-full py-4 text-lg font-bold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  저장 중...
                </>
              ) : (
                "수정하기"
              )}
            </Button>
          </div>
        </form>

        <DashboardNavigation />
      </div>
    </div>
  );
}
