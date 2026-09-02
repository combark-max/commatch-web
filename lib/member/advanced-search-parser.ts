import { normalizeProfileImagePath } from '@/lib/profile-image';

export type AdvancedSearchMember = {
  id: string;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  region: string | null;
  job: string | null;
  introduction: string | null;
  profile_image: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableAge = (value: unknown): value is number | null => (
  value === null
  || (typeof value === 'number' && Number.isInteger(value) && value >= 0)
);

const isNullableProfileImage = (value: unknown): value is string | null => (
  value === null
  || (typeof value === 'string'
    && value.trim() !== ''
    && normalizeProfileImagePath(value) !== null)
);

export function parseAdvancedSearchMembers(value: unknown): AdvancedSearchMember[] | null {
  if (!Array.isArray(value)) return null;

  const members: AdvancedSearchMember[] = [];

  for (const row of value) {
    if (
      !isRecord(row)
      || typeof row.id !== 'string'
      || !UUID_PATTERN.test(row.id)
      || !isNullableString(row.nickname)
      || !isNullableAge(row.age)
      || !isNullableString(row.gender)
      || !isNullableString(row.region)
      || !isNullableString(row.job)
      || !isNullableString(row.introduction)
      || !isNullableProfileImage(row.profile_image)
    ) {
      return null;
    }

    members.push({
      id: row.id,
      nickname: row.nickname,
      age: row.age,
      gender: row.gender,
      region: row.region,
      job: row.job,
      introduction: row.introduction,
      profile_image: row.profile_image,
    });
  }

  return members;
}
