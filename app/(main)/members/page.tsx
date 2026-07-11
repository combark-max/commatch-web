"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { REGIONS } from '@/constants/regions';
import { JOBS } from '@/constants/jobs';
import { User, MapPin, Briefcase, Loader2, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

type Member = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  region: string | null;
  job: string | null;
  introduction: string | null;
};

export default function MembersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('상관없음');
  const [selectedJob, setSelectedJob] = useState('상관없음');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchMembers = async () => {
      setIsLoading(true);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, region, job, introduction');

        if (error) {
          throw error;
        }

        if (isMounted) {
          setMembers((data as Member[]) ?? []);
        }
      } catch (error: unknown) {
        if (isMounted) {
          console.error('회원 목록 조회 실패:', error);
          setToast({ message: '회원 목록을 불러오는 중 오류가 발생했습니다.', type: 'error' });
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
  }, [supabase]);

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
      const matchesJob = selectedJob === '상관없음' || job === selectedJob;

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

        {members.length === 0 ? (
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
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <User size={64} strokeWidth={1.5} />
                  </div>
                  <div className="absolute left-4 top-4">
                    <span className="rounded-full border border-white/50 bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm backdrop-blur-sm">
                      {member.gender || '미입력'}
                    </span>
                  </div>
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
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
