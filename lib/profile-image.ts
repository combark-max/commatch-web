import { createClient } from './supabase/client';

/**
 * 프로필 이미지 경로를 정규화합니다.
 * 기존의 전체 URL이 저장되어 있는 경우 상대 경로로 변환하고,
 * 이미 상대 경로라면 그대로 반환합니다.
 * 
 * @param value - DB에서 읽은 profile_image 값 (URL 또는 상대 경로)
 * @returns 정규화된 상대 경로, 또는 null
 */
export function normalizeProfileImagePath(value: string | null): string | null {
  if (!value) return null;

  const marker = '/storage/v1/object/public/profile_images/';
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    // 전체 URL에서 상대 경로 추출
    try {
      return decodeURIComponent(value.substring(markerIndex + marker.length));
    } catch {
      return null;
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    // 다른 형태의 URL이면 null 반환
    return null;
  }

  // 이미 상대 경로이면 그대로 반환 (선행 슬래시 제거)
  return value.replace(/^\/+/, '');
}

/**
 * 상대 경로를 공개 URL로 변환합니다.
 * 
 * @param imagePath - 상대 경로 (예: "user-id/profile-123.jpg")
 * @returns 공개 URL
 */
export function getProfileImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;

  const supabase = createClient();
  const { data } = supabase.storage
    .from('profile_images')
    .getPublicUrl(imagePath);

  return data.publicUrl;
}

/**
 * 프로필 이미지 경로를 공개 URL로 변환합니다.
 * 저장된 값이 전체 URL이면 정규화한 후 공개 URL을 생성합니다.
 * 이미 공개 URL이면 그대로 반환합니다.
 * 
 * @param storedValue - DB에 저장된 profile_image 값
 * @returns 공개 URL 또는 null
 */
export function resolveProfileImageUrl(storedValue: string | null): string | null {
  if (!storedValue) return null;

  // 이미 저장된 값이 전체 URL이면 정규화
  const normalizedPath = normalizeProfileImagePath(storedValue);
  
  if (!normalizedPath) return null;

  return getProfileImageUrl(normalizedPath);
}
