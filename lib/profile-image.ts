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
 * 상대 경로를 인증된 동일 출처 이미지 API URL로 변환합니다.
 * 
 * @param imagePath - 상대 경로 (예: "user-id/profile-123.jpg")
 * @returns 인증 이미지 API URL
 */
export function getProfileImageUrl(imagePath: string | null): string | null {
  const normalizedPath = parseProfileImageRequestPath(imagePath);
  if (!normalizedPath) return null;

  return `/api/profile-images?path=${encodeURIComponent(normalizedPath)}`;
}

/**
 * 프로필 이미지 경로를 인증된 동일 출처 이미지 API URL로 변환합니다.
 * 저장된 값이 과거 공개 URL이면 정규화한 후 인증 API URL을 생성합니다.
 * 
 * @param storedValue - DB에 저장된 profile_image 값
 * @returns 인증 이미지 API URL 또는 null
 */
export function resolveProfileImageUrl(storedValue: string | null): string | null {
  return getProfileImageUrl(resolveProfileImagePath(storedValue));
}

const PROFILE_IMAGE_OWNER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseProfileImageRequestPath(value: string | null): string | null {
  if (!value || value !== value.trim() || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  const segments = value.split('/');
  if (
    segments.length < 2
    || !PROFILE_IMAGE_OWNER_PATTERN.test(segments[0])
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return null;
  }

  return value;
}

export function resolveProfileImagePath(storedValue: string | null): string | null {
  return parseProfileImageRequestPath(normalizeProfileImagePath(storedValue));
}
