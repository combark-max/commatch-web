import { type AdminRole } from '@/lib/admin/access';
import {
  isMemberAccountStatus,
  isMemberProfileVisibility,
  isMemberRestrictionActionType,
  type MemberAccountStatus,
  type MemberProfileVisibility,
  type MemberRestrictionActionType,
} from '@/lib/admin/member-restrictions';
import {
  isPremiumFeatureKey,
  isPremiumMembershipStatus,
  PREMIUM_MEMBERSHIP_ACTION_TYPES,
  type PremiumFeatureKey,
  type PremiumMembershipActionType,
  type PremiumMembershipStatus,
} from '@/lib/admin/premium-memberships';
import { isUuid } from '@/lib/admin/reports';

export type RecentMemberRestrictionAction = {
  actionId: string;
  actionType: MemberRestrictionActionType;
  subjectUserId: string;
  memberExists: boolean;
  profileExists: boolean;
  nickname: string | null;
  currentProfileVisibility: MemberProfileVisibility;
  previousAccountStatus: MemberAccountStatus;
  newAccountStatus: MemberAccountStatus;
  previousProfileVisibility: MemberProfileVisibility;
  newProfileVisibility: MemberProfileVisibility;
  previousSuspendedUntil: string | null;
  newSuspendedUntil: string | null;
  reason: string | null;
  note: string | null;
  reportId: string | null;
  reportExists: boolean;
  adminUserId: string | null;
  adminRole: AdminRole | null;
  createdAt: string;
};

export type RecentPremiumMembershipAction = {
  actionId: string;
  requestId: string;
  membershipId: string | null;
  subjectUserId: string;
  memberExists: boolean;
  profileExists: boolean;
  nickname: string | null;
  currentProfileVisibility: MemberProfileVisibility;
  actionType: PremiumMembershipActionType;
  previousStatus: PremiumMembershipStatus | null;
  newStatus: PremiumMembershipStatus;
  previousStartedAt: string | null;
  newStartedAt: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  previousFeatureKeys: PremiumFeatureKey[] | null;
  newFeatureKeys: PremiumFeatureKey[];
  reason: string;
  performedBy: string;
  adminRole: AdminRole | null;
  membershipUpdatedAt: string;
  createdAt: string;
};

export type RecentActivityResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'forbidden' | 'rpc_error' | 'parse_error' };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);
const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);
const isDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
);
const isNullableDateString = (value: unknown): value is string | null => (
  value === null || isDateString(value)
);
const isNullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const isAdminRole = (value: unknown): value is AdminRole => (
  value === 'super_admin' || value === 'admin' || value === 'moderator'
);
const isPremiumMembershipActionType = (value: unknown): value is PremiumMembershipActionType => (
  typeof value === 'string'
  && PREMIUM_MEMBERSHIP_ACTION_TYPES.includes(value as PremiumMembershipActionType)
);
const parseFeatureKeys = (value: unknown): PremiumFeatureKey[] | null => {
  if (!Array.isArray(value) || !value.every(isPremiumFeatureKey)) return null;
  return new Set(value).size === value.length ? value : null;
};

export const parseRecentMemberRestrictionActions = (
  value: unknown,
): RecentMemberRestrictionAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: RecentMemberRestrictionAction[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !isUuid(entry.action_id)
      || !isMemberRestrictionActionType(entry.action_type)
      || !isUuid(entry.subject_user_id)
      || typeof entry.member_exists !== 'boolean'
      || typeof entry.profile_exists !== 'boolean'
      || !isNullableString(entry.nickname)
      || !isMemberProfileVisibility(entry.current_profile_visibility)
      || !isMemberAccountStatus(entry.previous_account_status)
      || !isMemberAccountStatus(entry.new_account_status)
      || !isMemberProfileVisibility(entry.previous_profile_visibility)
      || !isMemberProfileVisibility(entry.new_profile_visibility)
      || !isNullableDateString(entry.previous_suspended_until)
      || !isNullableDateString(entry.new_suspended_until)
      || !isNullableString(entry.reason)
      || !isNullableString(entry.note)
      || !isNullableUuid(entry.report_id)
      || typeof entry.report_exists !== 'boolean'
      || !isNullableUuid(entry.admin_user_id)
      || !(entry.admin_role === null || isAdminRole(entry.admin_role))
      || !isDateString(entry.created_at)
      || (entry.report_exists && entry.report_id === null)
    ) return null;
    actions.push({
      actionId: entry.action_id,
      actionType: entry.action_type,
      subjectUserId: entry.subject_user_id,
      memberExists: entry.member_exists,
      profileExists: entry.profile_exists,
      nickname: entry.nickname,
      currentProfileVisibility: entry.current_profile_visibility,
      previousAccountStatus: entry.previous_account_status,
      newAccountStatus: entry.new_account_status,
      previousProfileVisibility: entry.previous_profile_visibility,
      newProfileVisibility: entry.new_profile_visibility,
      previousSuspendedUntil: entry.previous_suspended_until,
      newSuspendedUntil: entry.new_suspended_until,
      reason: entry.reason,
      note: entry.note,
      reportId: entry.report_id,
      reportExists: entry.report_exists,
      adminUserId: entry.admin_user_id,
      adminRole: entry.admin_role,
      createdAt: entry.created_at,
    });
  }
  return actions.length <= 5 ? actions : null;
};

export const parseRecentPremiumMembershipActions = (
  value: unknown,
): RecentPremiumMembershipAction[] | null => {
  if (!Array.isArray(value)) return null;
  const actions: RecentPremiumMembershipAction[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const previousFeatureKeys = entry.previous_feature_keys === null
      ? null : parseFeatureKeys(entry.previous_feature_keys);
    const newFeatureKeys = parseFeatureKeys(entry.new_feature_keys);
    if (
      !isUuid(entry.action_id)
      || !isUuid(entry.request_id)
      || !isNullableUuid(entry.membership_id)
      || !isUuid(entry.subject_user_id)
      || typeof entry.member_exists !== 'boolean'
      || typeof entry.profile_exists !== 'boolean'
      || !isNullableString(entry.nickname)
      || !isMemberProfileVisibility(entry.current_profile_visibility)
      || !isPremiumMembershipActionType(entry.action_type)
      || !(entry.previous_status === null || isPremiumMembershipStatus(entry.previous_status))
      || !isPremiumMembershipStatus(entry.new_status)
      || !isNullableDateString(entry.previous_started_at)
      || !isDateString(entry.new_started_at)
      || !isNullableDateString(entry.previous_expires_at)
      || !isNullableDateString(entry.new_expires_at)
      || (previousFeatureKeys === null && entry.previous_feature_keys !== null)
      || newFeatureKeys === null
      || newFeatureKeys.length < 1
      || newFeatureKeys.length > 4
      || typeof entry.reason !== 'string'
      || entry.reason.trim() !== entry.reason
      || entry.reason.length < 1
      || entry.reason.length > 500
      || !isUuid(entry.performed_by)
      || !(entry.admin_role === null || isAdminRole(entry.admin_role))
      || !isDateString(entry.membership_updated_at)
      || !isDateString(entry.created_at)
    ) return null;
    if (
      entry.action_type === 'granted'
        ? entry.previous_status !== null || entry.previous_started_at !== null
          || entry.previous_expires_at !== null || previousFeatureKeys !== null
        : !isPremiumMembershipStatus(entry.previous_status)
          || !isDateString(entry.previous_started_at)
          || previousFeatureKeys === null
          || previousFeatureKeys.length < 1
          || previousFeatureKeys.length > 4
    ) return null;
    actions.push({
      actionId: entry.action_id,
      requestId: entry.request_id,
      membershipId: entry.membership_id,
      subjectUserId: entry.subject_user_id,
      memberExists: entry.member_exists,
      profileExists: entry.profile_exists,
      nickname: entry.nickname,
      currentProfileVisibility: entry.current_profile_visibility,
      actionType: entry.action_type,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      previousStartedAt: entry.previous_started_at,
      newStartedAt: entry.new_started_at,
      previousExpiresAt: entry.previous_expires_at,
      newExpiresAt: entry.new_expires_at,
      previousFeatureKeys,
      newFeatureKeys,
      reason: entry.reason,
      performedBy: entry.performed_by,
      adminRole: entry.admin_role,
      membershipUpdatedAt: entry.membership_updated_at,
      createdAt: entry.created_at,
    });
  }
  return actions.length <= 5 ? actions : null;
};
