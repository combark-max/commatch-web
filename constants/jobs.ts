export const PROFILE_JOBS = [
  '회사원',
  '공무원',
  '교직원',
  '전문직',
  '의료인',
  '금융직',
  '연구직',
  'IT·개발',
  '교육직',
  '자영업',
  '프리랜서',
  '예술·문화',
  '서비스직',
  '생산·기술직',
  '학생',
  '취업준비',
  '기타',
] as const;

export const JOBS = ['상관없음', ...PROFILE_JOBS] as const;

export const STANDARD_JOB_VALUES = PROFILE_JOBS.filter((job) => job !== '기타');
