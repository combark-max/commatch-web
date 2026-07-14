export const PROFILE_REGIONS = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const;

export const REGIONS = ['상관없음', ...PROFILE_REGIONS] as const;

const LEGACY_REGION_MAP: Record<string, string> = {
  서울: '서울특별시',
  경기: '경기도',
  인천: '인천광역시',
  강원: '강원특별자치도',
  부산: '부산광역시',
  대구: '대구광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

export const normalizeRegion = (region: string | null | undefined) => {
  if (!region) return '';
  return LEGACY_REGION_MAP[region] ?? region;
};
