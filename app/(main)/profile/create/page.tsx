"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera, User, Calendar, MapPin, Briefcase, GraduationCap, Wine, Quote, Loader2, Ruler, Church, Palette } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { getProfileImageUrl, normalizeProfileImagePath } from '@/lib/profile-image';
import { normalizeRegion, PROFILE_REGIONS } from '@/constants/regions';
import { PROFILE_JOBS, STANDARD_JOB_VALUES } from '@/constants/jobs';

const profileSchema = z.object({
  nickname: z.string().min(2, { message: "닉네임은 최소 2자 이상이어야 합니다." }),
  gender: z.enum(['남성', '여성']).refine((value) => value !== undefined, {
    message: "성별을 선택해주세요.",
  }),
  birth_date: z.string().min(1, { message: "생년월일을 입력해주세요." }),
  height: z.string().min(1, { message: "키를 입력해주세요." }),
  region: z.string().min(1, { message: "거주지역을 선택해주세요." }),
  job: z.string().min(1, { message: "직업을 선택해주세요." }),
  job_other: z.string().optional(),
  education: z.string().min(1, { message: "학력을 선택해주세요." }),
  religion: z.string().min(1, { message: "종교를 선택해주세요." }),
  hobby: z.string().min(1, { message: "취미를 입력해주세요." }),
  drinking: z.string().min(1, { message: "음주 여부를 선택해주세요." }),
  introduction: z.string().min(10, { message: "한줄소개는 최소 10자 이상 작성해주세요." }),
}).superRefine((data, context) => {
  if (data.job === '기타' && !data.job_other?.trim()) {
    context.addIssue({
      code: 'custom',
      path: ['job_other'],
      message: '기타 직업을 입력해주세요.',
    });
  }
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const logSupabaseError = (label: string, error: unknown) => {
  const normalized = error as { code?: string; message?: string; details?: string; hint?: string } | undefined;

  console.error(label, {
    code: normalized?.code ?? null,
    message: normalized?.message ?? null,
    details: normalized?.details ?? null,
    hint: normalized?.hint ?? null,
    raw: error,
  });
};

export default function ProfileCreatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [storedImagePath, setStoredImagePath] = useState<string | null>(null);
  const [storedImageUrl, setStoredImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      job: "",
      job_other: "",
      introduction: "",
      height: "",
      hobby: "",
    },
  });

  const selectedGender = watch("gender");
  const selectedJob = watch("job");
  const displayImageUrl = previewUrl ?? storedImageUrl;

  const clearSelectedImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('jpg, jpeg, png, webp 형식의 이미지만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('이미지 크기는 5MB 이하만 가능합니다.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreviewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setUploadError(null);
  };

  const performImageDelete = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setToast({ message: '로그인이 필요합니다.', type: 'error' });
        return;
      }

      setIsDeletingImage(true);

      if (selectedFile) {
        clearSelectedImage();
        setToast({ message: '선택된 사진이 취소되었습니다.', type: 'success' });
        setIsDeletingImage(false);
        return;
      }

      // 기존 저장된 사진이 있는 경우
      if (storedImagePath) {
        const bucketName = 'profile_images';

        // Storage에서 파일 삭제
        const { error: deleteError } = await supabase.storage.from(bucketName).remove([storedImagePath]);

        if (deleteError) {
          // 파일이 없는 경우는 무시하고 DB는 정리 (404 에러)
          if (deleteError.message && deleteError.message.includes('not found')) {
            // 파일 없음 - DB만 정리
          } else {
            logSupabaseError('프로필 이미지 Storage 삭제 실패:', deleteError);
            setToast({ message: '프로필 사진 삭제에 실패했습니다.', type: 'error' });
            setIsDeletingImage(false);
            return;
          }
        }

        // DB에서 profile_image를 null로 변경
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ profile_image: null })
          .eq('id', user.id);

        if (updateError) {
          logSupabaseError('프로필 이미지 DB 삭제 실패:', updateError);
          setToast({ message: '프로필 사진 삭제에 실패했습니다.', type: 'error' });
          setIsDeletingImage(false);
          return;
        }

        // UI 업데이트
        setStoredImagePath(null);
        setStoredImageUrl(null);
        clearSelectedImage();
        setToast({ message: '프로필 사진이 삭제되었습니다.', type: 'success' });
      }
    } catch (error: unknown) {
      logSupabaseError('프로필 이미지 삭제 중 예외:', error);
      setToast({ message: '프로필 사진 삭제에 실패했습니다.', type: 'error' });
    } finally {
      setIsDeletingImage(false);
    }
  };

  const handleDeleteProfileImage = () => {
    if (!confirm('프로필 사진을 삭제하시겠습니까?')) {
      return;
    }

    performImageDelete();
  };

  useEffect(() => {
    const loadProfile = async () => {
      setIsFetchingProfile(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace('/login');
          setIsFetchingProfile(false);
          return;
        }

        let profileData: Record<string, unknown> | null = null;
        let profileError: unknown = null;

        try {
          const result = await supabase
            .from('profiles')
            .select('nickname, gender, birth_date, height, region, job, education, religion, hobby, drinking, introduction, profile_image')
            .eq('id', user.id)
            .maybeSingle();

          profileData = result.data as Record<string, unknown> | null;
          profileError = result.error;
        } catch (error) {
          profileError = error;
        }

        if (profileError) {
          const fallbackResult = await supabase
            .from('profiles')
            .select('nickname, gender, birth_date, height, region, job, education, religion, hobby, drinking, introduction')
            .eq('id', user.id)
            .maybeSingle();

          profileData = fallbackResult.data as Record<string, unknown> | null;
        }

        setHasExistingProfile(Boolean(profileData));

        if (profileData) {
          const existingJob = (profileData.job as string | null) ?? '';
          const isStandardJob = (STANDARD_JOB_VALUES as readonly string[]).includes(existingJob);
          reset({
            nickname: (profileData.nickname as string | null) ?? '',
            gender: profileData.gender as '남성' | '여성',
            birth_date: (profileData.birth_date as string | null) ?? '',
            height: profileData.height ? String(profileData.height) : '',
            region: normalizeRegion(profileData.region as string | null),
            job: existingJob ? (isStandardJob ? existingJob : '기타') : '',
            job_other: existingJob && !isStandardJob ? existingJob : '',
            education: (profileData.education as string | null) ?? '',
            religion: (profileData.religion as string | null) ?? '',
            hobby: (profileData.hobby as string | null) ?? '',
            drinking: (profileData.drinking as string | null) ?? '',
            introduction: (profileData.introduction as string | null) ?? '',
          });

          if (typeof profileData.profile_image === 'string') {
            const imagePath = normalizeProfileImagePath(profileData.profile_image);
            setStoredImagePath(imagePath);
            setStoredImageUrl(getProfileImageUrl(imagePath));
          } else {
            setStoredImagePath(null);
            setStoredImageUrl(null);
          }
        }
      } catch (error) {
        console.error('프로필 조회 실패:', error);
      } finally {
        setIsFetchingProfile(false);
      }
    };

    loadProfile();
  }, [reset, router, supabase]);

  const onSubmit = async (data: ProfileFormValues) => {
    setIsLoading(true);
    let uploadedFilePath: string | null = null;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setToast({ message: "로그인이 필요합니다.", type: 'error' });
        return;
      }

      if (selectedFile) {
        setIsUploadingImage(true);
        const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploadedFilePath = `${user.id}/profile-${Date.now()}.${fileExtension}`;

        const { error: imageUploadError } = await supabase.storage
          .from('profile_images')
          .upload(uploadedFilePath, selectedFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (imageUploadError) {
          logSupabaseError('프로필 이미지 업로드 실패:', imageUploadError);
          setToast({ message: '프로필 사진 업로드에 실패했습니다.', type: 'error' });
          return;
        }
      }

      const finalJob = data.job === '기타' ? data.job_other?.trim() ?? '' : data.job;
      const profileData = {
        id: user.id,
        nickname: data.nickname,
        gender: data.gender,
        birth_date: data.birth_date,
        height: parseInt(data.height, 10),
        region: data.region,
        job: finalJob,
        education: data.education,
        religion: data.religion,
        hobby: data.hobby,
        drinking: data.drinking,
        introduction: data.introduction,
        profile_image: uploadedFilePath ?? storedImagePath ?? null,
      };

      const { data: savedProfile, error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select('profile_image')
        .single();

      if (error) {
        console.error('프로필 저장 실패:', {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          data: savedProfile,
        });

        if (uploadedFilePath) {
          const { error: cleanupError } = await supabase.storage
            .from('profile_images')
            .remove([uploadedFilePath]);
          if (cleanupError) logSupabaseError('업로드된 프로필 이미지 정리 실패:', cleanupError);
        }

        setToast({ message: '프로필 저장에 실패했습니다. 다시 시도해주세요.', type: 'error' });
        return;
      }

      const savedImagePath = normalizeProfileImagePath(savedProfile.profile_image);
      setStoredImagePath(savedImagePath);
      setStoredImageUrl(getProfileImageUrl(savedImagePath));
      clearSelectedImage();
      setToast({ message: "프로필이 성공적으로 저장되었습니다.", type: 'success' });
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      logSupabaseError('프로필 저장 중 예외 발생:', err);
      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from('profile_images')
          .remove([uploadedFilePath]);
        if (cleanupError) logSupabaseError('업로드된 프로필 이미지 정리 실패:', cleanupError);
      }
      setToast({ message: "프로필 저장 중 오류가 발생했습니다.", type: 'error' });
    } finally {
      setIsUploadingImage(false);
      setIsLoading(false);
    }
  };

  const submitLabel = isLoading ? '저장 중...' : hasExistingProfile ? '수정하기' : '저장하기';

  if (isFetchingProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">프로필 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">프로필 설정</h1>
          <p className="mt-2 text-gray-600">당신을 더 잘 알 수 있도록 프로필을 완성해주세요.</p>
        </div>

        <form className="space-y-8" onSubmit={handleSubmit(onSubmit)}>
          {/* 1. Profile Picture Placeholder */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative group">
              <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
                {displayImageUrl ? (
                  <img src={displayImageUrl} alt="프로필 미리보기" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={40} className="text-gray-400" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpg,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                type="button"
                disabled={isUploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-[#16a34a] text-white p-2 rounded-full shadow-lg hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isUploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
            </div>
            <div className="mt-4 flex gap-3 justify-center w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="px-4 py-2 text-sm font-medium text-white bg-[#16a34a] rounded-lg hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                사진 선택
              </button>
              {(storedImagePath || selectedFile) && (
                <button
                  type="button"
                  onClick={handleDeleteProfileImage}
                  disabled={isDeletingImage}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {isDeletingImage ? '삭제 중...' : '사진 삭제'}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500">프로필 사진을 추가해주세요</p>
            {uploadError ? <p className="mt-2 text-xs text-red-500">{uploadError}</p> : null}
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
                {PROFILE_REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
              {errors.region && <p className="mt-1 text-xs text-red-500">{errors.region.message}</p>}
            </div>

            {/* 7. Job */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Briefcase size={16} className="mr-2 text-[#16a34a]" />
                직업
              </label>
              <select
                {...register("job")}
                className={`w-full px-4 py-2.5 border ${errors.job ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">직업을 선택해주세요</option>
                {PROFILE_JOBS.map((job) => (
                  <option key={job} value={job}>{job}</option>
                ))}
              </select>
              {errors.job && <p className="mt-1 text-xs text-red-500">{errors.job.message}</p>}
              {selectedJob === '기타' ? (
                <div className="mt-3">
                  <input
                    {...register('job_other')}
                    type="text"
                    placeholder="기타 직업을 입력해주세요"
                    className={`w-full px-4 py-2.5 border ${errors.job_other ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.job_other && <p className="mt-1 text-xs text-red-500">{errors.job_other.message}</p>}
                </div>
              ) : null}
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
                  {submitLabel}
                </>
              ) : (
                submitLabel
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
