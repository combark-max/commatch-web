"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera, User, Calendar, MapPin, Briefcase, GraduationCap, Wine, Quote, Loader2, Ruler, Church, Palette } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

const profileSchema = z.object({
  nickname: z.string().min(2, { message: "닉네임은 최소 2자 이상이어야 합니다." }),
  gender: z.enum(['남성', '여성'], { required_error: "성별을 선택해주세요." }),
  birth_date: z.string().min(1, { message: "생년월일을 입력해주세요." }),
  height: z.string().min(1, { message: "키를 입력해주세요." }),
  region: z.string().min(1, { message: "거주지역을 선택해주세요." }),
  job: z.string().min(1, { message: "직업을 입력해주세요." }),
  education: z.string().min(1, { message: "학력을 선택해주세요." }),
  religion: z.string().min(1, { message: "종교를 선택해주세요." }),
  hobby: z.string().min(1, { message: "취미를 입력해주세요." }),
  drinking: z.string().min(1, { message: "음주 여부를 선택해주세요." }),
  introduction: z.string().min(10, { message: "한줄소개는 최소 10자 이상 작성해주세요." }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileCreatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      job: "",
      introduction: "",
      height: "",
      hobby: "",
    },
  });

  const selectedGender = watch("gender");

  const onSubmit = async (data: ProfileFormValues) => {
    setIsLoading(true);
    try {
      // Get the currently authenticated user's ID
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setToast({ message: "로그인이 필요합니다.", type: 'error' });
        return;
      }

      // Insert profile data into the existing 'profiles' table
      // Note: Height, religion, and hobby are added to the UI but save logic remains focused on the existing structure
      // where smoking was removed and new fields are included if the table supports them.
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          nickname: data.nickname,
          gender: data.gender,
          birth_date: data.birth_date,
          height: parseInt(data.height),
          region: data.region,
          job: data.job,
          education: data.education,
          religion: data.religion,
          hobby: data.hobby,
          drinking: data.drinking,
          introduction: data.introduction,
        }, { onConflict: 'id' });

      if (error) {
        // Show Korean failure message
        setToast({ message: `저장 실패: ${error.message}`, type: 'error' });
      } else {
        // Successful save, redirect to home
        setToast({ message: "프로필이 성공적으로 저장되었습니다.", type: 'success' });
        setTimeout(() => {
          router.push('/');
        }, 1500);
      }
    } catch (err) {
      setToast({ message: "프로필 저장 중 오류가 발생했습니다.", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">프로필 설정</h1>
          <p className="mt-2 text-gray-600">당신을 더 잘 알 수 있도록 프로필을 완성해주세요.</p>
        </div>

        <form className="space-y-8" onSubmit={handleSubmit(onSubmit)}>
          {/* 1. Profile Picture Placeholder */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative group">
              <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
                <Camera size={40} className="text-gray-400" />
              </div>
              <button type="button" className="absolute bottom-0 right-0 bg-[#16a34a] text-white p-2 rounded-full shadow-lg hover:bg-green-700 transition-colors">
                <Camera size={16} />
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">프로필 사진을 추가해주세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 2. Nickname */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <User size={16} className="mr-2 text-[#16a34a]" />
                닉네임
              </label>
              <input
                {...register("nickname")}
                type="text"
                placeholder="멋진 닉네임을 입력하세요"
                className={`w-full px-4 py-2.5 border ${errors.nickname ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
              {errors.nickname && <p className="mt-1 text-xs text-red-500">{errors.nickname.message}</p>}
            </div>

            {/* 3. Gender */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                성별
              </label>
              <div className="flex gap-4">
                {['남성', '여성'].map((gender) => (
                  <label key={gender} className="flex-1">
                    <input
                      type="radio"
                      name="gender"
                      value={gender}
                      checked={selectedGender === gender}
                      onChange={() => setValue("gender", gender as '남성' | '여성')}
                      className="sr-only"
                    />
                    <div className={`w-full text-center py-2.5 border rounded-lg cursor-pointer transition-all ${
                      selectedGender === gender
                        ? 'border-[#16a34a] bg-green-50 text-[#16a34a]'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      {gender}
                    </div>
                  </label>
                ))}
              </div>
              {errors.gender && <p className="mt-1 text-xs text-red-500">{errors.gender.message}</p>}
            </div>

            {/* 4. Date of Birth */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Calendar size={16} className="mr-2 text-[#16a34a]" />
                생년월일
              </label>
              <input
                {...register("birth_date")}
                type="date"
                className={`w-full px-4 py-2.5 border ${errors.birth_date ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
              {errors.birth_date && <p className="mt-1 text-xs text-red-500">{errors.birth_date.message}</p>}
            </div>

            {/* 5. Height (cm) */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Ruler size={16} className="mr-2 text-[#16a34a]" />
                키 (cm)
              </label>
              <input
                {...register("height")}
                type="number"
                placeholder="키를 입력하세요"
                className={`w-full px-4 py-2.5 border ${errors.height ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
              {errors.height && <p className="mt-1 text-xs text-red-500">{errors.height.message}</p>}
            </div>

            {/* 6. Residence */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <MapPin size={16} className="mr-2 text-[#16a34a]" />
                거주지역
              </label>
              <select
                {...register("region")}
                className={`w-full px-4 py-2.5 border ${errors.region ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">지역 선택</option>
                <option value="서울">서울</option>
                <option value="경기">경기</option>
                <option value="인천">인천</option>
                <option value="기타">기타</option>
              </select>
              {errors.region && <p className="mt-1 text-xs text-red-500">{errors.region.message}</p>}
            </div>

            {/* 7. Job */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Briefcase size={16} className="mr-2 text-[#16a34a]" />
                직업
              </label>
              <input
                {...register("job")}
                type="text"
                placeholder="현재 직업을 입력하세요"
                className={`w-full px-4 py-2.5 border ${errors.job ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
              {errors.job && <p className="mt-1 text-xs text-red-500">{errors.job.message}</p>}
            </div>

            {/* 8. Education */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <GraduationCap size={16} className="mr-2 text-[#16a34a]" />
                학력
              </label>
              <select
                {...register("education")}
                className={`w-full px-4 py-2.5 border ${errors.education ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">학력 선택</option>
                <option value="고졸">고졸</option>
                <option value="전문대졸">전문대졸</option>
                <option value="대졸">대졸</option>
                <option value="석사">석사</option>
                <option value="박사">박사</option>
              </select>
              {errors.education && <p className="mt-1 text-xs text-red-500">{errors.education.message}</p>}
            </div>

            {/* 9. Religion */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Church size={16} className="mr-2 text-[#16a34a]" />
                종교
              </label>
              <select
                {...register("religion")}
                className={`w-full px-4 py-2.5 border ${errors.religion ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">종교 선택</option>
                <option value="무교">무교</option>
                <option value="기독교">기독교</option>
                <option value="천주교">천주교</option>
                <option value="불교">불교</option>
                <option value="기타">기타</option>
              </select>
              {errors.religion && <p className="mt-1 text-xs text-red-500">{errors.religion.message}</p>}
            </div>

            {/* 10. Hobby */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Palette size={16} className="mr-2 text-[#16a34a]" />
                취미
              </label>
              <input
                {...register("hobby")}
                type="text"
                placeholder="취미를 입력하세요"
                className={`w-full px-4 py-2.5 border ${errors.hobby ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
              {errors.hobby && <p className="mt-1 text-xs text-red-500">{errors.hobby.message}</p>}
            </div>

            {/* 11. Drinking */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Wine size={16} className="mr-2 text-[#16a34a]" />
                음주 여부
              </label>
              <select
                {...register("drinking")}
                className={`w-full px-4 py-2.5 border ${errors.drinking ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">선택</option>
                <option value="전혀 안 함">전혀 안 함</option>
                <option value="가끔 함">가끔 함</option>
                <option value="자주 함">자주 함</option>
              </select>
              {errors.drinking && <p className="mt-1 text-xs text-red-500">{errors.drinking.message}</p>}
            </div>
          </div>

          {/* 12. Introduction */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              <Quote size={16} className="mr-2 text-[#16a34a]" />
              한줄소개
            </label>
            <textarea
              {...register("introduction")}
              rows={3}
              placeholder="자신에 대해 한 줄로 멋지게 설명해주세요."
              className={`w-full px-4 py-2.5 border ${errors.introduction ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
            ></textarea>
            {errors.introduction && <p className="mt-1 text-xs text-red-500">{errors.introduction.message}</p>}
          </div>

          <div className="pt-6">
            <Button
              type="submit"
              className="w-full py-4 text-lg font-bold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={20} />
                  저장 중...
                </>
              ) : (
                "저장하기"
              )}
            </Button>
          </div>
        </form>
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
