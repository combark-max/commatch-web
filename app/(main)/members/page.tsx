"use client";

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, MapPin, Briefcase, Loader2, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

export default function MembersPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchMembers = async () => {
      setIsLoading(true);
      try {
        // 1. 현재 로그인 사용자 가져오기
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          console.log("로그인한 사용자 정보가 없습니다.");
          setIsLoading(false);
          return;
        }

        // 2. profiles 테이블에서 회원 목록 조회
        // profile_image 컬럼이 존재하지 않아 조회 대상에서 제외했습니다.
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, job, region, introduction');

        if (error) {
          console.error("Supabase Query Error Detail:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
          throw error;
        }

        console.log("회원 목록 데이터:", data);
        setMembers(data || []);
      } catch (error: any) {
        console.error("회원 목록 조회 실패:", error);
        setToast({ message: "회원 목록을 불러오는 중 오류가 발생했습니다.", type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [supabase]);

  // 생년월일로 나이 계산 함수
  const calculateAge = (birthDate: string) => {
    if (!birthDate) return "";
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age}세`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 text-[#16a34a] animate-spin mb-4" />
        <p className="text-gray-500 font-medium animate-pulse">회원 목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            회원 둘러보기 <span className="text-lg font-medium text-[#16a34a]">({members.length})</span>
          </h1>
          <p className="mt-2 text-gray-600">ComMatch에서 활동 중인 멋진 회원들을 만나보세요.</p>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">등록된 회원이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {members.map((member) => (
              <div
                key={member.id}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-green-500/20 transition-all duration-300 overflow-hidden group"
              >
                {/* 프로필 이미지 영역 - 기본 이미지만 사용 */}
                <div className="aspect-[4/5] relative bg-gray-100 overflow-hidden">
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <User size={64} strokeWidth={1.5} />
                  </div>
                  <div className="absolute top-4 left-4">
                    <span className="bg-white/90 backdrop-blur-sm text-xs font-bold px-3 py-1.5 rounded-full text-gray-700 shadow-sm border border-white/50">
                      {member.gender}
                    </span>
                  </div>
                </div>

                {/* 정보 영역 */}
                <div className="p-6">
                  <div className="flex items-end justify-between mb-3">
                    <h3 className="text-xl font-bold text-gray-900 truncate">
                      {member.nickname || "익명"}
                    </h3>
                    <span className="text-sm font-semibold text-[#16a34a] mb-0.5">
                      {calculateAge(member.birth_date)}
                    </span>
                  </div>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center text-sm text-gray-500">
                      <MapPin size={14} className="mr-1.5 text-gray-400" />
                      {member.region || "지역 미설정"}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Briefcase size={14} className="mr-1.5 text-gray-400" />
                      {member.job || "직업 미설정"}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem] leading-relaxed mb-6">
                    {member.introduction || "자기소개가 아직 없습니다."}
                  </p>

                  <Button
                    className="w-full py-3 rounded-2xl font-bold text-sm"
                    disabled={true}
                  >
                    프로필 보기
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
