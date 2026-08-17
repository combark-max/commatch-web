export const ADMIN_GENDER_CATEGORIES = ['male', 'female', 'other_or_unspecified'] as const;
export const ADMIN_MEMBERSHIP_TIER_CATEGORIES = ['general', 'premium'] as const;
export const ADMIN_AGE_GROUP_CATEGORIES = [
  'under_20',
  '20s',
  '30s',
  '40s',
  '50s',
  '60_plus',
  'unspecified',
] as const;
export const ADMIN_MARRIAGE_CATEGORIES = [
  'first_marriage',
  'remarriage',
  'unspecified',
] as const;

export type AdminGenderCategory = (typeof ADMIN_GENDER_CATEGORIES)[number];
export type AdminMembershipTierCategory = (typeof ADMIN_MEMBERSHIP_TIER_CATEGORIES)[number];
export type AdminAgeGroupCategory = (typeof ADMIN_AGE_GROUP_CATEGORIES)[number];
export type AdminMarriageCategory = (typeof ADMIN_MARRIAGE_CATEGORIES)[number];

export type AdminStatisticsEntry<Category extends string = string> = {
  category: Category;
  count: number;
};

export type AdminMemberStatistics = {
  totalMembers: number;
  membershipTiers: AdminStatisticsEntry<AdminMembershipTierCategory>[];
  gender: AdminStatisticsEntry<AdminGenderCategory>[];
  ageGroups: AdminStatisticsEntry<AdminAgeGroupCategory>[];
  regions: AdminStatisticsEntry[];
  marriageHistory: AdminStatisticsEntry<AdminMarriageCategory>[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
};

const parseFixedEntries = <Category extends string>(
  value: unknown,
  categories: readonly Category[],
): AdminStatisticsEntry<Category>[] | null => {
  if (!Array.isArray(value) || value.length !== categories.length) return null;
  const allowed = new Set<string>(categories);
  const seen = new Set<string>();
  const entries: AdminStatisticsEntry<Category>[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.category !== 'string' || !allowed.has(item.category)) {
      return null;
    }
    const count = parseCount(item.count);
    if (count === null || seen.has(item.category)) return null;
    seen.add(item.category);
    entries.push({ category: item.category as Category, count });
  }

  return categories.map((category) => entries.find((entry) => entry.category === category)!);
};

const parseRegions = (value: unknown): AdminStatisticsEntry[] | null => {
  if (!Array.isArray(value)) return null;
  const entries: AdminStatisticsEntry[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.category !== 'string') return null;
    const category = item.category;
    const count = parseCount(item.count);
    if (
      !category
      || category !== category.trim()
      || category.length > 100
      || count === null
      || count === 0
      || seen.has(category)
    ) {
      return null;
    }
    seen.add(category);
    entries.push({ category, count });
  }

  return entries;
};

const sumCounts = (entries: AdminStatisticsEntry[]) => (
  entries.reduce((total, entry) => total + entry.count, 0)
);

export const parseAdminMemberStatistics = (value: unknown): AdminMemberStatistics => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('Invalid administrator member statistics response');
  }

  const row = value[0];
  const totalMembers = parseCount(row.total_members);
  const membershipTiers = parseFixedEntries(
    row.membership_tiers,
    ADMIN_MEMBERSHIP_TIER_CATEGORIES,
  );
  const gender = parseFixedEntries(row.gender, ADMIN_GENDER_CATEGORIES);
  const ageGroups = parseFixedEntries(row.age_groups, ADMIN_AGE_GROUP_CATEGORIES);
  const regions = parseRegions(row.regions);
  const marriageHistory = parseFixedEntries(row.marriage_history, ADMIN_MARRIAGE_CATEGORIES);

  if (
    totalMembers === null
    || !membershipTiers
    || !gender
    || !ageGroups
    || !regions
    || !marriageHistory
    || sumCounts(membershipTiers) !== totalMembers
    || sumCounts(gender) !== totalMembers
    || sumCounts(ageGroups) !== totalMembers
    || sumCounts(regions) !== totalMembers
    || sumCounts(marriageHistory) !== totalMembers
    || totalMembers > 0 && regions.length === 0
    || totalMembers === 0 && regions.length !== 0
  ) {
    throw new Error('Invalid administrator member statistics response');
  }

  return { totalMembers, membershipTiers, gender, ageGroups, regions, marriageHistory };
};
