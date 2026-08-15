import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPremiumFeatureKey,
  parseAdminPremiumMembershipDetail,
  parsePremiumMembershipUpdateResult,
  PREMIUM_FEATURE_KEYS,
} from './premium-memberships.ts';

const SUBJECT_USER_ID = 'c692c612-4499-4802-9b45-611e4f132ac0';
const MEMBERSHIP_ID = 'b5abdcf0-c6ca-4705-b16e-d9b6bfed4185';
const ACTION_ID = '7f18045c-b3d1-4ff4-80d0-4968336d2b0c';
const REQUEST_ID = '6619b08f-71cb-44fb-ae97-ad33a70b52dc';
const ADMIN_ID = '37c50695-b6bf-4573-b617-6bbd227d6f44';
const TIMESTAMP = '2026-08-15T00:00:00.000Z';

const resultRow = {
  is_success: true,
  is_noop: false,
  is_duplicate_request: false,
  membership_id: MEMBERSHIP_ID,
  subject_user_id: SUBJECT_USER_ID,
  stored_status: 'active',
  is_available: true,
  started_at: TIMESTAMP,
  expires_at: null,
  feature_keys: [...PREMIUM_FEATURE_KEYS],
  membership_updated_at: TIMESTAMP,
  action_id: ACTION_ID,
  action_type: 'updated',
};

test('formal Premium feature contract contains exactly five explicit keys', () => {
  assert.deepEqual(PREMIUM_FEATURE_KEYS, [
    'likes_received',
    'received_likes',
    'advanced_member_search',
    'expanded_recommendations',
    'priority_recommendation',
  ]);
  assert.equal(isPremiumFeatureKey('priority_recommendation'), true);
  assert.equal(isPremiumFeatureKey('not_a_feature'), false);
});

test('administrator update parser accepts all five feature keys', () => {
  const parsed = parsePremiumMembershipUpdateResult([resultRow], SUBJECT_USER_ID);

  assert.deepEqual(parsed?.featureKeys, PREMIUM_FEATURE_KEYS);
  assert.equal(parsed?.actionType, 'updated');
});

test('administrator update parser rejects duplicate, unknown, and sixth keys', () => {
  for (const featureKeys of [
    ['priority_recommendation', 'priority_recommendation'],
    ['priority_recommendation', 'not_a_feature'],
    [...PREMIUM_FEATURE_KEYS, 'not_a_feature'],
  ]) {
    assert.equal(
      parsePremiumMembershipUpdateResult(
        [{ ...resultRow, feature_keys: featureKeys }],
        SUBJECT_USER_ID,
      ),
      null,
    );
  }
});

test('administrator detail and action history parse five-key snapshots', () => {
  const parsed = parseAdminPremiumMembershipDetail([{
    subject_user_id: SUBJECT_USER_ID,
    profile_exists: true,
    nickname: '테스트 회원',
    membership_exists: true,
    membership_id: MEMBERSHIP_ID,
    stored_status: 'active',
    is_available: true,
    is_not_started: false,
    is_expired: false,
    started_at: TIMESTAMP,
    expires_at: null,
    feature_keys: [...PREMIUM_FEATURE_KEYS],
    membership_updated_at: TIMESTAMP,
    account_status: 'active',
    profile_visibility: 'visible',
    recent_actions: [{
      id: ACTION_ID,
      request_id: REQUEST_ID,
      action_type: 'updated',
      previous_status: 'active',
      new_status: 'active',
      previous_started_at: TIMESTAMP,
      new_started_at: TIMESTAMP,
      previous_expires_at: null,
      new_expires_at: null,
      previous_feature_keys: [...PREMIUM_FEATURE_KEYS],
      new_feature_keys: [...PREMIUM_FEATURE_KEYS],
      reason: '우선 추천 권한 추가',
      performed_by: ADMIN_ID,
      membership_updated_at: TIMESTAMP,
      created_at: TIMESTAMP,
    }],
  }]);

  assert.deepEqual(parsed?.featureKeys, PREMIUM_FEATURE_KEYS);
  assert.deepEqual(parsed?.recentActions[0].newFeatureKeys, PREMIUM_FEATURE_KEYS);
});
