"use client";

import React, { useState, useMemo } from "react";
import { Heart, Users, Calendar, MapPin, Ruler, Briefcase, Quote, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { JOBS } from "@/constants/jobs";
import { REGIONS } from "@/constants/regions";

export default function PreferencePage() {
  // 컴포넌트 내부에서 매번 클라이언트를 생성하지 않도록 useMemo 사용 또는 안정화
  const supabase = useMemo(() => createClient(), []);

  const [isLoading, setIsLoading] = useState(false);

  // State integration
  const [preferredGender, setPreferredGender] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [heightMin, setHeightMin] = useState("");
  const [heightMax, setHeightMax] = useState("");
  const [preferredJob, setPreferredJob] = useState("");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [introduction, setIntroduction] = useState("");

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // 1. 현재 로그인한 사용자 가져오기
      // getUser()는 서버에 세션을 확인하므로 가장 확실하지만,
      // 클라이언트 측에서는 getSession()을 통해 현재 메모리/스토리지의 세션을 먼저 확인할 수도 있습니다.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("Current User:", user);

      const { data: session } = await supabase.auth.getSession();
      console.log("Current Session:", session);

      if (!user) {
        alert("로그인이 필요합니다.");
        return;
      }

      // 2. preferences 테이블에 upsert 수행
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
        console.log("Supabase Error:", JSON.stringify(error, null, 2));
        console.dir(error);
        alert("저장에 실패했습니다.");
      } else {
        alert("이상형 설정이 저장되었습니다.");
      }
    } catch (error) {
      console.log("Catch Error:", JSON.stringify(error, null, 2));
      console.dir(error);
      alert("저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
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

          <div className="pt-6">
            <Button type="submit" className="w-full py-4 text-lg font-bold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장하기"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
