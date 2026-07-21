export const LOGIN_ID_MIN_LENGTH = 5;
export const LOGIN_ID_MAX_LENGTH = 20;
export const LOGIN_ID_PATTERN = /^[a-z0-9_]{5,20}$/;
export const INTERNAL_AUTH_DOMAIN = 'commatch.internal';

export const normalizeLoginId = (loginId: string): string => loginId.trim().toLowerCase();

export const isValidLoginId = (loginId: string): boolean => LOGIN_ID_PATTERN.test(normalizeLoginId(loginId));

export const toInternalAuthEmail = (loginId: string): string => {
  const normalizedLoginId = normalizeLoginId(loginId);

  if (!LOGIN_ID_PATTERN.test(normalizedLoginId)) {
    throw new Error('유효하지 않은 로그인 아이디입니다.');
  }

  return `${normalizedLoginId}@${INTERNAL_AUTH_DOMAIN}`;
};
