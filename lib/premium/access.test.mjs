import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPremiumAvailabilityState,
  hasPremiumEntitlement,
  parsePremiumAccessRpcResponse,
  PREMIUM_FEATURE_KEYS,
} from './access.ts';

const STARTED_AT = '2026-08-01T00:00:00.000Z';
const EXPIRES_AT = '2027-08-01T00:00:00.000Z';

test('active Premium access exposes only the entitlements returned by the existing RPC', () => {
  const access = parsePremiumAccessRpcResponse([{
    membership_exists: true,
    status: 'active',
    is_available: true,
    started_at: STARTED_AT,
    expires_at: EXPIRES_AT,
    feature_keys: ['received_likes', 'expanded_recommendations'],
  }]);

  assert.ok(access);
  assert.equal(hasPremiumEntitlement(access, 'received_likes'), true);
  assert.equal(hasPremiumEntitlement(access, 'advanced_member_search'), false);
});

test('suspended, revoked, and expired memberships never expose feature access', () => {
  for (const row of [
    { status: 'suspended', is_available: false },
    { status: 'revoked', is_available: false },
    { status: 'active', is_available: false },
  ]) {
    const access = parsePremiumAccessRpcResponse([{
      membership_exists: true,
      started_at: STARTED_AT,
      expires_at: EXPIRES_AT,
      feature_keys: [...PREMIUM_FEATURE_KEYS],
      ...row,
    }]);
    assert.ok(access);
    assert.equal(hasPremiumEntitlement(access, 'priority_recommendation'), false);
  }
});

test('no membership is a valid unavailable state', () => {
  assert.deepEqual(parsePremiumAccessRpcResponse([{
    membership_exists: false,
    status: null,
    is_available: false,
    started_at: null,
    expires_at: null,
    feature_keys: [],
  }]), {
    membershipExists: false,
    status: null,
    isAvailable: false,
    startedAt: null,
    expiresAt: null,
    featureKeys: [],
  });
});

test('malformed, duplicate, or unknown entitlement responses fail closed', () => {
  const base = {
    membership_exists: true,
    status: 'active',
    is_available: true,
    started_at: STARTED_AT,
    expires_at: EXPIRES_AT,
  };
  assert.equal(parsePremiumAccessRpcResponse([{ ...base, feature_keys: ['unknown'] }]), null);
  assert.equal(parsePremiumAccessRpcResponse([{ ...base, feature_keys: ['received_likes', 'received_likes'] }]), null);
  assert.equal(parsePremiumAccessRpcResponse([]), null);
});

test('membership period distinguishes not-started and expired active rows', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  assert.equal(getPremiumAvailabilityState({
    membershipExists: true,
    status: 'active',
    isAvailable: false,
    startedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: null,
    featureKeys: [],
  }, now), 'not_started');
  assert.equal(getPremiumAvailabilityState({
    membershipExists: true,
    status: 'active',
    isAvailable: false,
    startedAt: STARTED_AT,
    expiresAt: '2026-09-01T00:00:00.000Z',
    featureKeys: [],
  }, now), 'expired');
});
