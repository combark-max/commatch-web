const KOREAN_MOBILE_COMPACT_PATTERN = /^010[0-9]{8}$/;
const KOREAN_MOBILE_HYPHEN_PATTERN = /^010-[0-9]{4}-[0-9]{4}$/;
const KOREAN_MOBILE_SPACE_PATTERN = /^010 [0-9]{4} [0-9]{4}$/;
const KOREAN_MOBILE_E164_PATTERN = /^\+8210[0-9]{8}$/;

const parseKoreanMobilePhone = (phone: string): string | null => {
  const trimmedPhone = phone.trim();

  if (KOREAN_MOBILE_E164_PATTERN.test(trimmedPhone)) {
    return trimmedPhone;
  }

  if (
    KOREAN_MOBILE_COMPACT_PATTERN.test(trimmedPhone)
    || KOREAN_MOBILE_HYPHEN_PATTERN.test(trimmedPhone)
    || KOREAN_MOBILE_SPACE_PATTERN.test(trimmedPhone)
  ) {
    const domesticPhone = trimmedPhone.replaceAll('-', '').replaceAll(' ', '');
    return `+82${domesticPhone.slice(1)}`;
  }

  return null;
};

export const normalizeKoreanPhoneToE164 = (phone: string): string => {
  const normalizedPhone = parseKoreanMobilePhone(phone);

  if (!normalizedPhone) {
    throw new Error('유효하지 않은 한국 휴대폰 번호입니다.');
  }

  return normalizedPhone;
};

export const isValidKoreanMobilePhone = (phone: string): boolean => parseKoreanMobilePhone(phone) !== null;

export const formatKoreanMobilePhone = (phone: string): string => {
  const normalizedPhone = normalizeKoreanPhoneToE164(phone);
  const domesticPhone = `0${normalizedPhone.slice(3)}`;

  return `${domesticPhone.slice(0, 3)}-${domesticPhone.slice(3, 7)}-${domesticPhone.slice(7)}`;
};
