"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera, User, Calendar, MapPin, Briefcase, GraduationCap, Wine, Quote, Loader2, Ruler, Church, Palette, Plus, Star, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import ImageModal from '@/components/common/ImageModal';
import { createClient } from '@/lib/supabase/client';
import { getProfileImageUrl, normalizeProfileImagePath } from '@/lib/profile-image';
import { normalizeRegion, PROFILE_REGIONS } from '@/constants/regions';
import { PROFILE_JOBS, STANDARD_JOB_VALUES } from '@/constants/jobs';

const nicknameSchema = z.string().trim().min(2, { message: "닉네임은 최소 2자 이상이어야 합니다." });

const profileSchema = z.object({
  nickname: nicknameSchema,
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
  smoking: z.string().trim().min(1, { message: "흡연 정보를 선택해 주세요." }),
  marriage_history: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.enum(["first_marriage", "remarriage"], {
      message: "결혼 이력을 선택해 주세요.",
    }),
  ),
  marriage_values: z.string().trim()
    .min(10, { message: "결혼 가치관을 10자 이상 작성해 주세요." })
    .max(500, { message: "결혼 가치관은 최대 500자까지 작성할 수 있습니다." }),
  introduction: z.string().trim()
    .min(10, { message: "한줄소개는 최소 10자 이상 작성해주세요." })
    .max(500, { message: "자기소개는 최대 500자까지 작성할 수 있습니다." }),
}).superRefine((data, context) => {
  if (data.job === '기타' && !data.job_other?.trim()) {
    context.addIssue({
      code: 'custom',
      path: ['job_other'],
      message: '기타 직업을 입력해주세요.',
    });
  }
});

type ProfileFormInput = z.input<typeof profileSchema>;
type ProfileFormValues = z.output<typeof profileSchema>;
type NicknameCheckStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

type StoredPhoto = {
  id: string;
  kind: 'stored';
  path: string;
  previewUrl: string;
};

type PendingPhoto = {
  id: string;
  kind: 'pending';
  file: File;
  previewUrl: string;
  fingerprint: string;
};

type ProfilePhoto = StoredPhoto | PendingPhoto;

const MAX_PROFILE_PHOTOS = 5;
const PROFILE_PHOTO_BUCKET = 'profile_images';

const isMissingProfileColumnError = (error: unknown) => {
  const normalized = error as { code?: string; message?: string } | undefined;
  const message = normalized?.message?.toLowerCase() ?? '';
  return Boolean(
    (message.includes('marriage_values') || message.includes('marriage_history'))
    && (normalized?.code === '42703' || normalized?.code === 'PGRST204' || message.includes('column')),
  );
};

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
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [persistedPrimaryPath, setPersistedPrimaryPath] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [originalNickname, setOriginalNickname] = useState<string | null>(null);
  const [checkedNicknameInput, setCheckedNicknameInput] = useState<string | null>(null);
  const [nicknameCheckStatus, setNicknameCheckStatus] = useState<NicknameCheckStatus>('idle');
  const [nicknameCheckMessage, setNicknameCheckMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPreviewUrlsRef = useRef<Set<string>>(new Set());
  const hasScrolledToSectionRef = useRef(false);
  const nicknameInputValueRef = useRef('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      job: "",
      job_other: "",
      introduction: "",
      height: "",
      hobby: "",
      smoking: "",
      marriage_history: "",
      marriage_values: "",
    },
  });

  const formValues = watch();
  const selectedGender = formValues.gender;
  const selectedJob = formValues.job;
  const introductionLength = formValues.introduction?.length ?? 0;
  const marriageValuesLength = formValues.marriage_values?.length ?? 0;
  const completionFields = [
    photos.length > 0,
    Boolean(formValues.nickname?.trim()),
    Boolean(formValues.gender?.trim()),
    Boolean(formValues.birth_date?.trim()),
    Number(formValues.height) > 0,
    Boolean(formValues.region?.trim()),
    Boolean(formValues.job?.trim()),
    Boolean(formValues.education?.trim()),
    Boolean(formValues.religion?.trim()),
    Boolean(formValues.hobby?.trim()),
    Boolean(formValues.drinking?.trim()),
    Boolean(formValues.smoking?.trim()),
    typeof formValues.marriage_history === 'string' && Boolean(formValues.marriage_history.trim()),
    (formValues.introduction?.trim().length ?? 0) >= 10,
    (formValues.marriage_values?.trim().length ?? 0) >= 10,
  ];
  const completedFieldCount = completionFields.filter(Boolean).length;
  const profileCompletion = Math.round((completedFieldCount / completionFields.length) * 100);

  useEffect(() => {
    const currentNicknameInput = formValues.nickname ?? '';
    nicknameInputValueRef.current = currentNicknameInput;

    if (checkedNicknameInput !== null && currentNicknameInput !== checkedNicknameInput) {
      setCheckedNicknameInput(null);
      setNicknameCheckStatus('idle');
      setNicknameCheckMessage(null);
    }
  }, [checkedNicknameInput, formValues.nickname]);

  const handleNicknameAvailabilityCheck = async () => {
    const currentNicknameInput = formValues.nickname ?? '';
    const parsedNickname = nicknameSchema.safeParse(currentNicknameInput);

    if (!parsedNickname.success) {
      setError('nickname', {
        type: 'manual',
        message: parsedNickname.error.issues[0]?.message ?? '닉네임을 확인해 주세요.',
      });
      setCheckedNicknameInput(null);
      setNicknameCheckStatus('idle');
      setNicknameCheckMessage(null);
      return;
    }

    clearErrors('nickname');
    setCheckedNicknameInput(currentNicknameInput);
    setNicknameCheckStatus('checking');
    setNicknameCheckMessage('닉네임을 확인하고 있습니다.');

    try {
      const response = await fetch('/api/profile/nickname-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: parsedNickname.data }),
      });
      const result = await response.json().catch(() => null) as { available?: boolean; message?: string } | null;

      if (nicknameInputValueRef.current !== currentNicknameInput) return;

      if (!response.ok || typeof result?.available !== 'boolean') {
        setNicknameCheckStatus('error');
        setNicknameCheckMessage(result?.message ?? '닉네임 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      setNicknameCheckStatus(result.available ? 'available' : 'unavailable');
      setNicknameCheckMessage(result.message ?? (result.available
        ? '사용 가능한 닉네임입니다.'
        : '이미 사용 중인 닉네임입니다.'));
    } catch {
      if (nicknameInputValueRef.current !== currentNicknameInput) return;
      setNicknameCheckStatus('error');
      setNicknameCheckMessage('닉네임 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const releasePendingPreview = (previewUrl: string) => {
    URL.revokeObjectURL(previewUrl);
    pendingPreviewUrlsRef.current.delete(previewUrl);
  };

  useEffect(() => {
    const pendingPreviewUrls = pendingPreviewUrlsRef.current;
    return () => {
      pendingPreviewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      pendingPreviewUrls.clear();
    };
  }, []);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (selectedFiles.length === 0) return;

    if (photos.length + selectedFiles.length > MAX_PROFILE_PHOTOS) {
      setUploadError(`프로필 사진은 최대 ${MAX_PROFILE_PHOTOS}장까지 등록할 수 있습니다.`);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    for (const file of selectedFiles) {
      if (!allowedTypes.includes(file.type)) {
        setUploadError(`${file.name}: jpg, jpeg, png, webp 형식의 이미지만 선택할 수 있습니다.`);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setUploadError(`${file.name}: 이미지 크기는 5MB 이하만 가능합니다.`);
        return;
      }
    }

    const existingFingerprints = new Set(
      photos.filter((photo): photo is PendingPhoto => photo.kind === 'pending').map((photo) => photo.fingerprint),
    );
    const selectedFingerprints = selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`);
    const uniqueFingerprints = new Set(selectedFingerprints);

    if (uniqueFingerprints.size !== selectedFingerprints.length || selectedFingerprints.some((fingerprint) => existingFingerprints.has(fingerprint))) {
      setUploadError('같은 사진이 이미 저장 전 목록에 있습니다.');
      return;
    }

    const selectedAt = Date.now();
    const pendingPhotos = selectedFiles.map((file, index): PendingPhoto => {
      const previewUrl = URL.createObjectURL(file);
      pendingPreviewUrlsRef.current.add(previewUrl);
      return {
        id: `pending-${selectedAt}-${index}-${file.name}`,
        kind: 'pending',
        file,
        previewUrl,
        fingerprint: selectedFingerprints[index],
      };
    });

    setPhotos((current) => [...current, ...pendingPhotos]);
    setUploadError(null);
  };

  const removePendingPhoto = (photoId: string) => {
    const target = photos.find((photo): photo is PendingPhoto => photo.id === photoId && photo.kind === 'pending');
    if (!target) return;

    if (modalImageUrl === target.previewUrl) {
      setModalImageUrl(null);
      window.requestAnimationFrame(() => releasePendingPreview(target.previewUrl));
    } else {
      releasePendingPreview(target.previewUrl);
    }

    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setUploadError(null);
  };

  const selectPrimaryPhoto = (photoId: string) => {
    setPhotos((current) => {
      const targetIndex = current.findIndex((photo) => photo.id === photoId);
      if (targetIndex <= 0) return current;
      const next = [...current];
      const [target] = next.splice(targetIndex, 1);
      return [target, ...next];
    });
  };

  const deleteStoredPhoto = async (targetPhoto: StoredPhoto) => {
    if (!window.confirm('이 사진을 삭제하시겠습니까?')) return;

    if (modalImageUrl === targetPhoto.previewUrl) setModalImageUrl(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setToast({ message: '로그인이 필요합니다.', type: 'error' });
        return;
      }

      setDeletingPhotoId(targetPhoto.id);
      const remainingStoredPhotos = photos.filter(
        (photo): photo is StoredPhoto => photo.kind === 'stored' && photo.id !== targetPhoto.id,
      );
      const remainingPaths = remainingStoredPhotos.map((photo) => photo.path);
      const nextPrimaryPath = remainingPaths[0] ?? null;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_images: remainingPaths, profile_image: nextPrimaryPath })
        .eq('id', user.id);

      if (updateError) {
        logSupabaseError('프로필 사진 DB 삭제 반영 실패:', updateError);
        setToast({ message: '프로필 사진 삭제에 실패했습니다.', type: 'error' });
        return;
      }

      setPhotos((current) => current.filter((photo) => photo.id !== targetPhoto.id));
      setPersistedPrimaryPath(nextPrimaryPath);

      if (!targetPhoto.path.startsWith(`${user.id}/`)) {
        console.warn('사용자 디렉터리 밖의 프로필 사진 경로는 Storage에서 삭제하지 않았습니다.', {
          userId: user.id,
          path: targetPhoto.path,
        });
        setToast({ message: '프로필 사진이 삭제되었습니다.', type: 'success' });
        return;
      }

      const { error: storageDeleteError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .remove([targetPhoto.path]);

      if (storageDeleteError) {
        logSupabaseError('프로필 사진 Storage 정리 실패:', storageDeleteError);
        setToast({ message: '사진 정보는 삭제되었지만 Storage 파일 정리에 실패했습니다.', type: 'error' });
        return;
      }

      setToast({ message: '프로필 사진이 삭제되었습니다.', type: 'success' });
    } catch (error: unknown) {
      logSupabaseError('프로필 사진 삭제 중 예외:', error);
      setToast({ message: '프로필 사진 삭제에 실패했습니다.', type: 'error' });
    } finally {
      setDeletingPhotoId(null);
    }
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
            .select('nickname, gender, birth_date, height, region, job, education, religion, hobby, drinking, smoking, marriage_history, marriage_values, introduction, profile_image, profile_images')
            .eq('id', user.id)
            .maybeSingle();

          profileData = result.data as Record<string, unknown> | null;
          profileError = result.error;
        } catch (error) {
          profileError = error;
        }

        if (profileError) {
          if (isMissingProfileColumnError(profileError)) throw profileError;

          const fallbackResult = await supabase
            .from('profiles')
            .select('nickname, gender, birth_date, height, region, job, education, religion, hobby, drinking, smoking, marriage_history, marriage_values, introduction, profile_image')
            .eq('id', user.id)
            .maybeSingle();

          if (fallbackResult.error) {
            if (isMissingProfileColumnError(fallbackResult.error)) throw fallbackResult.error;

            const legacyFallbackResult = await supabase
              .from('profiles')
              .select('nickname, gender, birth_date, height, region, job, education, religion, hobby, drinking, smoking, marriage_history, marriage_values, introduction')
              .eq('id', user.id)
              .maybeSingle();
            if (legacyFallbackResult.error) throw legacyFallbackResult.error;
            profileData = legacyFallbackResult.data as Record<string, unknown> | null;
          } else {
            profileData = fallbackResult.data as Record<string, unknown> | null;
          }
        }

        setHasExistingProfile(Boolean(profileData));

        if (profileData) {
          const existingJob = (profileData.job as string | null) ?? '';
          const existingNickname = ((profileData.nickname as string | null) ?? '').trim();
          const isStandardJob = (STANDARD_JOB_VALUES as readonly string[]).includes(existingJob);
          setOriginalNickname(existingNickname);
          reset({
            nickname: existingNickname,
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
            smoking: profileData.smoking === '미입력' ? '' : (profileData.smoking as string | null) ?? '',
            marriage_history: (profileData.marriage_history as 'first_marriage' | 'remarriage' | null) ?? '',
            marriage_values: (profileData.marriage_values as string | null) ?? '',
            introduction: (profileData.introduction as string | null) ?? '',
          });

          const storedPrimaryPath = typeof profileData.profile_image === 'string'
            ? normalizeProfileImagePath(profileData.profile_image)
            : null;
          const storedPhotoValues = Array.isArray(profileData.profile_images) && profileData.profile_images.length > 0
            ? profileData.profile_images
            : storedPrimaryPath
              ? [storedPrimaryPath]
              : [];
          const storedPhotoPaths = Array.from(new Set(
            storedPhotoValues
              .map((value) => typeof value === 'string' ? normalizeProfileImagePath(value) : null)
              .filter((value): value is string => Boolean(value)),
          )).slice(0, MAX_PROFILE_PHOTOS);

          setPhotos(storedPhotoPaths.map((path) => ({
            id: `stored-${path}`,
            kind: 'stored',
            path,
            previewUrl: getProfileImageUrl(path) ?? '',
          })));
          setPersistedPrimaryPath(storedPhotoPaths[0] ?? null);
        }
      } catch (error) {
        if (isMissingProfileColumnError(error)) {
          setToast({
            message: '프로필 저장 구조가 아직 적용되지 않았습니다. Supabase SQL을 먼저 실행해 주세요.',
            type: 'error',
          });
        } else {
          console.error('프로필 조회 실패:', error);
        }
      } finally {
        setIsFetchingProfile(false);
      }
    };

    loadProfile();
  }, [reset, router, supabase]);

  useEffect(() => {
    if (isFetchingProfile || hasScrolledToSectionRef.current) return;

    let sectionId = '';
    try {
      sectionId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    } catch {
      return;
    }
    if (!sectionId) return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hasScrolledToSectionRef.current = true;
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isFetchingProfile]);

  const onSubmit = async (data: ProfileFormValues) => {
    const isOriginalNickname = originalNickname !== null && data.nickname === originalNickname;
    const isCheckedNicknameCurrent = nicknameCheckStatus === 'available'
      && checkedNicknameInput !== null
      && checkedNicknameInput === nicknameInputValueRef.current
      && checkedNicknameInput.trim() === data.nickname;

    if (!isOriginalNickname && !isCheckedNicknameCurrent) {
      setToast({ message: '닉네임 중복 확인을 완료해 주세요.', type: 'error' });
      return;
    }

    setIsLoading(true);
    const isPendingPhotoExpanded = photos.some(
      (photo) => photo.kind === 'pending' && photo.previewUrl === modalImageUrl,
    );
    if (isPendingPhotoExpanded) setModalImageUrl(null);
    const uploadedFilePaths: string[] = [];

    const cleanupUploadedFiles = async () => {
      if (uploadedFilePaths.length === 0) return;
      const { error: cleanupError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .remove(uploadedFilePaths);
      if (cleanupError) logSupabaseError('업로드된 프로필 이미지 정리 실패:', cleanupError);
    };

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setToast({ message: "로그인이 필요합니다.", type: 'error' });
        return;
      }

      if (photos.length > MAX_PROFILE_PHOTOS) {
        setUploadError(`프로필 사진은 최대 ${MAX_PROFILE_PHOTOS}장까지 등록할 수 있습니다.`);
        return;
      }

      const pendingPhotos = photos.filter((photo): photo is PendingPhoto => photo.kind === 'pending');
      const uploadedPathsByPhotoId = new Map<string, string>();

      if (pendingPhotos.length > 0) setIsUploadingImage(true);

      for (const [index, photo] of pendingPhotos.entries()) {
        const fileExtension = photo.file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uniqueSuffix = Math.random().toString(36).slice(2, 10);
        const uploadedFilePath = `${user.id}/profile-${Date.now()}-${index}-${uniqueSuffix}.${fileExtension}`;
        const { error: imageUploadError } = await supabase.storage
          .from(PROFILE_PHOTO_BUCKET)
          .upload(uploadedFilePath, photo.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (imageUploadError) {
          logSupabaseError(`프로필 이미지 업로드 실패 (${index + 1}번째, ${photo.file.name}):`, imageUploadError);
          await cleanupUploadedFiles();
          setToast({ message: `${photo.file.name} 사진 업로드에 실패했습니다. 기존 사진은 유지됩니다.`, type: 'error' });
          return;
        }

        uploadedFilePaths.push(uploadedFilePath);
        uploadedPathsByPhotoId.set(photo.id, uploadedFilePath);
      }

      const finalPhotoPaths = photos.map((photo) => photo.kind === 'stored'
        ? photo.path
        : uploadedPathsByPhotoId.get(photo.id))
        .filter((path): path is string => Boolean(path));

      if (finalPhotoPaths.length > MAX_PROFILE_PHOTOS || finalPhotoPaths.length !== photos.length) {
        await cleanupUploadedFiles();
        setUploadError(`프로필 사진은 최대 ${MAX_PROFILE_PHOTOS}장까지 등록할 수 있습니다.`);
        return;
      }

      const finalJob = data.job === '기타' ? data.job_other?.trim() ?? '' : data.job;
      const profileData = {
        id: user.id,
        nickname: data.nickname.trim(),
        gender: data.gender,
        birth_date: data.birth_date,
        height: parseInt(data.height, 10),
        region: data.region,
        job: finalJob,
        education: data.education,
        religion: data.religion,
        hobby: data.hobby,
        drinking: data.drinking,
        smoking: data.smoking.trim(),
        marriage_history: data.marriage_history,
        marriage_values: data.marriage_values.trim(),
        introduction: data.introduction.trim(),
        profile_image: finalPhotoPaths[0] ?? null,
        profile_images: finalPhotoPaths,
      };

      const { data: savedProfile, error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select('profile_image, profile_images')
        .single();

      if (error) {
        console.error('프로필 저장 실패:', {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          data: savedProfile,
        });

        await cleanupUploadedFiles();
        if (error.code === '23505') {
          setNicknameCheckStatus('unavailable');
          setNicknameCheckMessage('이미 사용 중인 닉네임입니다.');
          setToast({ message: '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.', type: 'error' });
        } else if (isMissingProfileColumnError(error)) {
          setToast({
            message: '프로필 저장 구조가 아직 적용되지 않았습니다. Supabase SQL을 먼저 실행해 주세요.',
            type: 'error',
          });
        } else {
          setToast({ message: '프로필 저장에 실패했습니다. 다시 시도해주세요.', type: 'error' });
        }
        return;
      }

      photos.forEach((photo) => {
        if (photo.kind === 'pending') releasePendingPreview(photo.previewUrl);
      });
      setPhotos(finalPhotoPaths.map((path) => ({
        id: `stored-${path}`,
        kind: 'stored',
        path,
        previewUrl: getProfileImageUrl(path) ?? '',
      })));
      setPersistedPrimaryPath(finalPhotoPaths[0] ?? null);
      setUploadError(null);
      setToast({ message: "프로필이 성공적으로 저장되었습니다.", type: 'success' });
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      logSupabaseError('프로필 저장 중 예외 발생:', err);
      await cleanupUploadedFiles();
      if (isMissingProfileColumnError(err)) {
        setToast({
          message: '프로필 저장 구조가 아직 적용되지 않았습니다. Supabase SQL을 먼저 실행해 주세요.',
          type: 'error',
        });
      } else {
        setToast({ message: "프로필 저장 중 오류가 발생했습니다.", type: 'error' });
      }
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
          <h1 className="text-3xl font-bold text-gray-900">프로필 작성</h1>
          <p className="mt-2 text-gray-600">기본정보부터 자기소개까지 차근차근 작성해주세요.</p>
          <p className="mt-1 text-sm text-gray-500">일부 추천 고도화 기능은 순차적으로 도입될 예정입니다.</p>
        </div>

        <div className="mb-8 rounded-2xl border border-green-100 bg-green-50 p-5">
          <div className="grid grid-cols-2 gap-2 text-center text-xs font-semibold text-gray-500 sm:grid-cols-4">
            <span className="rounded-lg bg-white px-2 py-2 text-green-700">기본 정보</span>
            <span className="rounded-lg bg-white px-2 py-2 text-green-700">생활 정보</span>
            <span className="rounded-lg bg-white px-2 py-2 text-green-700">자기소개</span>
            <span className="rounded-lg bg-gray-100 px-2 py-2">추천 고도화 기능 · 도입 예정</span>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="text-sm font-bold text-gray-800">프로필 완성도 {profileCompletion}%</p>
            <span className="text-xs text-gray-500">{completedFieldCount} / {completionFields.length} 항목</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-[#16a34a] transition-[width]" style={{ width: `${profileCompletion}%` }} />
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">프로필을 충실히 작성할수록 향후 추천 정확도가 높아집니다.</p>
        </div>

        <form className="space-y-8" onSubmit={handleSubmit(onSubmit)}>
          <section id="photos" className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">프로필 사진</h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">첫 번째 사진이 대표사진으로 표시됩니다. 최대 5장까지 등록할 수 있습니다.</p>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700">
                {photos.length} / {MAX_PROFILE_PHOTOS}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpg,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageSelect}
            />

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: MAX_PROFILE_PHOTOS }, (_, index) => {
                const photo = photos[index];
                if (!photo) {
                  return (
                    <button
                      key={`empty-${index}`}
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photos.length >= MAX_PROFILE_PHOTOS || isLoading || Boolean(deletingPhotoId)}
                      className="flex aspect-[4/5] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition hover:border-green-400 hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`${index + 1}번째 프로필 사진 추가`}
                    >
                      <Plus size={24} />
                      <span className="mt-2 text-xs font-semibold">사진 추가</span>
                    </button>
                  );
                }

                const isPersistedPrimary = photo.kind === 'stored' && photo.path === persistedPrimaryPath;
                const primaryLabel = isPersistedPrimary ? '대표사진' : '저장 후 대표사진';

                return (
                  <div key={photo.id} className="relative aspect-[4/5] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm">
                    {photo.previewUrl ? (
                      <button
                        type="button"
                        onClick={() => setModalImageUrl(photo.previewUrl)}
                        disabled={isLoading || Boolean(deletingPhotoId)}
                        aria-label={`${index === 0 ? '대표 ' : ''}프로필 사진 ${index + 1} 크게 보기`}
                        className="h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-500 disabled:cursor-not-allowed"
                      >
                        <img src={photo.previewUrl} alt={`${index + 1}번째 프로필 사진`} className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400"><Camera size={28} /></div>
                    )}

                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
                      {index === 0 ? (
                        <span className="rounded-full bg-green-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">{primaryLabel}</span>
                      ) : null}
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold shadow-sm ${photo.kind === 'pending' ? 'bg-amber-50 text-[#806B26]' : 'bg-white/90 text-gray-600'}`}>
                        {photo.kind === 'pending' ? '저장 전' : '저장됨'}
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 z-10 flex gap-1 bg-black/55 p-2">
                      {index > 0 ? (
                        <button
                          type="button"
                          onClick={() => selectPrimaryPhoto(photo.id)}
                          disabled={isLoading || Boolean(deletingPhotoId)}
                          className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-white/95 px-2 text-[10px] font-bold text-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Star size={12} /> 대표 선택
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => photo.kind === 'pending' ? removePendingPhoto(photo.id) : void deleteStoredPhoto(photo)}
                        disabled={isLoading || Boolean(deletingPhotoId)}
                        className="flex min-h-8 items-center justify-center rounded-lg bg-red-500 px-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`${index + 1}번째 프로필 사진 삭제`}
                      >
                        {deletingPhotoId === photo.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">jpg, jpeg, png, webp · 파일당 최대 5MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photos.length >= MAX_PROFILE_PHOTOS || isLoading || Boolean(deletingPhotoId)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isUploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {photos.length >= MAX_PROFILE_PHOTOS ? '최대 5장 등록됨' : '사진 추가'}
              </button>
            </div>
            {uploadError ? <p className="mt-3 text-xs font-medium text-red-500">{uploadError}</p> : null}
          </section>

          <section id="basic-info" className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="mb-6 text-lg font-bold text-gray-900">기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 2. Nickname */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <User size={16} className="mr-2 text-[#16a34a]" />
                닉네임
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  {...register("nickname")}
                  type="text"
                  placeholder="멋진 닉네임을 입력하세요"
                  className={`min-w-0 flex-1 px-4 py-2.5 border ${errors.nickname ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 rounded-lg px-4 py-2.5 text-sm shadow-none"
                  onClick={handleNicknameAvailabilityCheck}
                  disabled={nicknameCheckStatus === 'checking' || isLoading}
                >
                  {nicknameCheckStatus === 'checking' ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 확인 중</>
                  ) : '중복 확인'}
                </Button>
              </div>
              {errors.nickname && <p className="mt-1 text-xs text-red-500">{errors.nickname.message}</p>}
              {nicknameCheckMessage ? (
                <p className={`mt-1 text-xs font-medium ${
                  nicknameCheckStatus === 'available'
                    ? 'text-green-600'
                    : nicknameCheckStatus === 'checking'
                      ? 'text-gray-500'
                      : 'text-red-500'
                }`}>
                  {nicknameCheckMessage}
                </p>
              ) : null}
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
              {/* TODO: 회원가입 단계에서 지역 정보를 수집하게 되면 자동 입력 연결 */}
              <p className="mt-1.5 text-xs text-gray-400">회원가입 정보 자동 입력 기능은 추후 도입될 예정입니다.</p>
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
            </div>
          </section>

          <section id="lifestyle" className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="mb-6 text-lg font-bold text-gray-900">생활 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <p className="mt-1.5 text-xs text-gray-400">여러 취미를 최대 5개까지 선택하는 기능은 도입 예정입니다.</p>
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

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                흡연 <span className="text-red-500 ml-1">*</span>
              </label>
              <select
                {...register("smoking")}
                className={`w-full px-4 py-2.5 border ${errors.smoking ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">선택</option>
                <option value="비흡연">비흡연</option>
                <option value="가끔 흡연">가끔 흡연</option>
                <option value="흡연">흡연</option>
                <option value="금연 중">금연 중</option>
                <option value="공개하지 않음">공개하지 않음</option>
              </select>
              {errors.smoking && <p className="mt-1 text-xs text-red-500">{errors.smoking.message}</p>}
            </div>
            </div>
          </section>

          <section id="marriage-values" className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-gray-900">결혼 가치관 <span className="text-red-500">*</span></h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">서로 존중하는 관계, 결혼 시기, 자녀 계획 등 중요하게 생각하는 내용을 자유롭게 작성해 주세요.</p>
            <div className="mt-4">
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                결혼 이력 <span className="text-red-500 ml-1">*</span>
              </label>
              <select
                {...register("marriage_history")}
                className={`w-full px-4 py-2.5 border ${errors.marriage_history ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">선택</option>
                <option value="first_marriage">초혼</option>
                <option value="remarriage">재혼</option>
              </select>
              {errors.marriage_history && <p className="mt-1 text-xs text-red-500">{errors.marriage_history.message}</p>}
            </div>
            <textarea
              {...register("marriage_values")}
              rows={4}
              maxLength={500}
              className={`mt-4 w-full px-4 py-2.5 border ${errors.marriage_values ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
            ></textarea>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <p className="text-gray-400">주소, 자산, 가족의 민감한 개인정보는 입력하지 마세요.</p>
              <span className="shrink-0 text-gray-500">{marriageValuesLength} / 500자</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">10자 이상 500자 이하로 작성해 주세요.</p>
            {errors.marriage_values && <p className="mt-1 text-xs text-red-500">{errors.marriage_values.message}</p>}
            <div className="mt-5 rounded-xl border border-green-100 bg-green-50 p-4">
              <p className="text-sm font-bold text-green-800">향후 추천 고도화에 활용 예정</p>
              <p className="mt-2 text-xs leading-5 text-gray-600">프로필 정보를 자세히 작성하면 향후 더 정교한 추천 기능에 활용될 수 있습니다.</p>
            </div>
          </section>

          {/* 12. Introduction */}
          <section id="introduction" className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="mb-6 text-lg font-bold text-gray-900">자기소개</h2>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              <Quote size={16} className="mr-2 text-[#16a34a]" />
              한줄소개
            </label>
            <textarea
              {...register("introduction")}
              rows={3}
              maxLength={500}
              placeholder="안녕하세요. 배려와 대화를 중요하게 생각합니다. 주말에는 산책이나 여행을 좋아하며, 평생 함께 웃을 수 있는 사람을 만나고 싶습니다."
              className={`w-full px-4 py-2.5 border ${errors.introduction ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
            ></textarea>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <p className={introductionLength < 20 ? 'font-medium text-amber-600' : 'text-gray-400'}>20자 이상 작성하면 자신을 더 잘 표현할 수 있습니다.</p>
              <span className="shrink-0 text-gray-500">{introductionLength} / 500자</span>
            </div>
            {errors.introduction && <p className="mt-1 text-xs text-red-500">{errors.introduction.message}</p>}

            {/* TODO: AI 문장 다듬기 API, 개인정보 안내, 사용량 정책 확정 후 연결 */}
            <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-800">AI가 더 자연스럽게 다듬기</p>
                <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600">도입 예정</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">작성한 내용을 바탕으로 문장을 자연스럽게 다듬는 기능이 추후 추가될 예정입니다.</p>
            </div>
          </section>

          <div className="pt-6">
            <Button
              type="submit"
              className="w-full py-4 text-lg font-bold"
              disabled={isLoading || Boolean(deletingPhotoId)}
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

      <ImageModal
        key={modalImageUrl ?? 'profile-create-photo-modal'}
        isOpen={Boolean(modalImageUrl)}
        imageUrl={modalImageUrl}
        alt="프로필 사진"
        onClose={() => setModalImageUrl(null)}
      />
    </div>
  );
}
