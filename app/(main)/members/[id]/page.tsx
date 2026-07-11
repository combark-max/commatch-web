"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  User, MapPin, Briefcase, GraduationCap,
  Church, Palette, Ruler, Quote, Loader2
} from 'lucide-react';
import Button from '@/components/ui/Button';

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
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
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
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, job, region, introduction, education, religion, hobby, drinking')
          .eq('id', memberId)
          .maybeSingle();

        if (error) {
          console.error('회원 정보 조회 실패:', error);
          setMember(null);
        } else {
          setMember(data as MemberProfile | null);
        }
      } catch (error) {
        console.error('데이터 fetching 중 오류:', error);
        setMember(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMember();
  }, [memberId, supabase]);

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
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.push('/members')}
            className="flex items-center text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
          >
            <span>회원목록으로</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-xl">
          <div className="relative flex h-64 items-center justify-center border-b border-gray-50 bg-[#f0fdf4]">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-md">
              <User size={64} strokeWidth={1.5} />
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
                <Button className="rounded-2xl px-6 py-3 text-sm font-bold">
                  관심회원 추가
                </Button>
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
