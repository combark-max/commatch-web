"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  User, MapPin, Briefcase, GraduationCap,
  Church, Palette, Ruler, Quote, ArrowLeft, Loader2
} from 'lucide-react';
import Button from '@/components/ui/Button';

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchMember = async () => {
      if (!params.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, job, region, introduction, education, religion, hobby, drinking')
          .eq('id', params.id)
          .single();

        if (error) {
          console.error("회원 정보 조회 실패:", error);
        } else {
          setMember(data);
        }
      } catch (error) {
        console.error("데이터 fetching 중 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMember();
  }, [params.id, supabase]);

  // 나이 계산 함수
  const calculateAge = (birthDate: string | null | undefined) => {
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
        <p className="text-gray-500 font-medium">회원 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
        <div className="text-center">
          <User size={64} className="mx-auto text-gray-200 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">존재하지 않는 회원입니다.</h2>
          <p className="text-gray-500 mb-8">요청하신 회원을 찾을 수 없거나 이미 탈퇴한 회원일 수 있습니다.</p>
          <Button onClick={() => router.back()}>뒤로 가기</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-gray-500 hover:text-gray-900 transition-colors mb-6 group"
        >
          <ArrowLeft size={20} className="mr-1 group-hover:-translate-x-1 transition-transform" />
          <span>목록으로</span>
        </button>

        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
          {/* 상단 프로필 이미지 & 기본 정보 */}
          <div className="relative h-64 bg-[#f0fdf4] flex items-center justify-center border-b border-gray-50">
            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center text-gray-300 shadow-md border-4 border-white">
              <User size={64} strokeWidth={1.5} />
            </div>
            <div className="absolute top-6 right-6">
              <span className="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
                {member.gender}
              </span>
            </div>
          </div>

          <div className="p-8 md:p-12">
            {/* 헤더 정보 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 border-b border-gray-50 pb-8">
              <div>
                <h1 className="text-4xl font-black text-gray-900 mb-2">
                  {member.nickname || "익명"}
                </h1>
                <div className="flex items-center gap-3 text-lg font-semibold text-[#16a34a]">
                  <span>{calculateAge(member.birth_date)}</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                  <span>{member.region || "지역 미설정"}</span>
                </div>
              </div>
              <Button size="lg" className="px-10 rounded-2xl h-14 text-lg">매칭 신청하기</Button>
            </div>

            {/* 상세 정보 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 mb-12">
              <InfoItem icon={<Briefcase size={20}/>} label="직업" value={member.job} />
              <InfoItem icon={<Ruler size={20}/>} label="키" value={member.height ? `${member.height}cm` : null} />
              <InfoItem icon={<GraduationCap size={20}/>} label="학력" value={member.education} />
              <InfoItem icon={<Church size={20}/>} label="종교" value={member.religion} />
              <InfoItem icon={<Palette size={20}/>} label="취미" value={member.hobby} />
              <InfoItem icon={<MapPin size={20}/>} label="지역" value={member.region} />
              <InfoItem icon={<User size={20}/>} label="음주" value={member.drinking} />
            </div>

            {/* 자기소개 */}
            <div className="bg-gray-50 rounded-[2rem] p-8 md:p-10 relative">
              <Quote className="absolute top-6 left-6 text-green-200 w-12 h-12 -z-0" />
              <div className="relative z-10">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-[#16a34a] rounded-full"></span>
                  자기소개
                </h3>
                <p className="text-gray-600 leading-loose whitespace-pre-wrap text-lg">
                  {member.introduction || "등록된 자기소개가 없습니다."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: any }) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 p-2 bg-green-50 text-[#16a34a] rounded-xl">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-gray-400 mb-1">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value || "미설정"}</p>
      </div>
    </div>
  );
}
