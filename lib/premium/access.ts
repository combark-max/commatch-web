export const PREMIUM_FEATURE_KEYS = [
  'likes_received',
  'received_likes',
  'advanced_member_search',
  'expanded_recommendations',
  'priority_recommendation',
] as const;

export type PremiumFeatureKey = (typeof PREMIUM_FEATURE_KEYS)[number];
export type PremiumMembershipStatus = 'active' | 'suspended' | 'revoked';

export type PremiumAccess = {
  membershipExists: boolean;
  status: PremiumMembershipStatus | null;
  isAvailable: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  featureKeys: PremiumFeatureKey[];
};

const FEATURE_KEY_SET = new Set<string>(PREMIUM_FEATURE_KEYS);
const STATUS_SET = new Set<string>(['active', 'suspended', 'revoked']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isNullableDate = (value: unknown): value is string | null => (
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
);

export function parsePremiumAccessRpcResponse(value: unknown): PremiumAccess | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  if (
    typeof row.membership_exists !== 'boolean'
    || typeof row.is_available !== 'boolean'
    || !isNullableDate(row.started_at)
    || !isNullableDate(row.expires_at)
    || !Array.isArray(row.feature_keys)
  ) {
    return null;
  }

  const status = row.status === null
    ? null
    : typeof row.status === 'string' && STATUS_SET.has(row.status)
      ? row.status as PremiumMembershipStatus
      : undefined;
  if (status === undefined) return null;

  const featureKeys: PremiumFeatureKey[] = [];
  for (const key of row.feature_keys) {
    if (typeof key !== 'string' || !FEATURE_KEY_SET.has(key)) return null;
    featureKeys.push(key as PremiumFeatureKey);
  }
  if (new Set(featureKeys).size !== featureKeys.length) return null;

  if (
    (!row.membership_exists && (
      status !== null
      || row.is_available
      || row.started_at !== null
      || row.expires_at !== null
      || featureKeys.length > 0
    ))
    || (row.membership_exists && (status === null || row.started_at === null))
    || (row.is_available && status !== 'active')
  ) {
    return null;
  }

  return {
    membershipExists: row.membership_exists,
    status,
    isAvailable: row.is_available,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    featureKeys,
  };
}

export function hasPremiumEntitlement(
  access: PremiumAccess | null,
  featureKey: PremiumFeatureKey,
): boolean {
  return access?.isAvailable === true && access.featureKeys.includes(featureKey);
}

export type PremiumAvailabilityState =
  | 'none'
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'not_started'
  | 'expired'
  | 'unavailable';

export function getPremiumAvailabilityState(
  access: PremiumAccess | null,
  now = new Date(),
): PremiumAvailabilityState {
  if (!access?.membershipExists) return 'none';
  if (access.status === 'suspended') return 'suspended';
  if (access.status === 'revoked') return 'revoked';
  if (access.isAvailable) return 'active';
  if (access.startedAt && Date.parse(access.startedAt) > now.getTime()) return 'not_started';
  if (access.expiresAt && Date.parse(access.expiresAt) <= now.getTime()) return 'expired';
  return 'unavailable';
}
