import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdminMemberList } from './members.ts';

const USER_ID = 'c692c612-4499-4802-9b45-611e4f132ac0';
const TIMESTAMP = '2026-08-15T00:00:00.000Z';

const memberRow = {
  member_user_id: USER_ID,
  nickname: '목록 테스트 회원',
  joined_at: TIMESTAMP,
  profile_exists: true,
  profile_status: 'completed',
  profile_visibility: 'visible',
  gender: '여성',
  age: 36,
  region: '서울',
  job: '개발자',
  marriage_history: 'first_marriage',
  stored_account_status: 'active',
  current_account_status: 'active',
  suspended_at: null,
  suspended_until: null,
  premium_membership_exists: false,
  premium_stored_status: null,
  premium_is_available: false,
  premium_period_state: 'none',
  total_count: 1,
};

test('member list parser maps demographic fields without changing existing state fields', () => {
  const parsed = parseAdminMemberList([memberRow]);

  assert.deepEqual(parsed?.[0], {
    memberUserId: USER_ID,
    nickname: '목록 테스트 회원',
    joinedAt: TIMESTAMP,
    profileExists: true,
    profileStatus: 'completed',
    profileVisibility: 'visible',
    gender: '여성',
    age: 36,
    region: '서울',
    job: '개발자',
    marriageHistory: 'first_marriage',
    storedAccountStatus: 'active',
    currentAccountStatus: 'active',
    suspendedAt: null,
    suspendedUntil: null,
    premiumMembershipExists: false,
    premiumStoredStatus: null,
    premiumIsAvailable: false,
    premiumPeriodState: 'none',
    totalCount: 1,
  });
});

test('member list parser accepts nullable demographic values for an existing profile', () => {
  const parsed = parseAdminMemberList([{
    ...memberRow,
    gender: null,
    age: null,
    region: null,
    job: null,
    marriage_history: null,
  }]);

  assert.equal(parsed?.[0]?.age, null);
  assert.equal(parsed?.[0]?.gender, null);
});

test('member list parser rejects malformed ages', () => {
  assert.equal(parseAdminMemberList([{ ...memberRow, age: 36.5 }]), null);
  assert.equal(parseAdminMemberList([{ ...memberRow, age: '36' }]), null);
});

test('member without a profile must have null demographic values', () => {
  const missingProfileRow = {
    ...memberRow,
    nickname: null,
    profile_exists: false,
    profile_status: 'missing',
    profile_visibility: null,
    gender: null,
    age: null,
    region: null,
    job: null,
    marriage_history: null,
  };

  assert.notEqual(parseAdminMemberList([missingProfileRow]), null);
  assert.equal(parseAdminMemberList([{ ...missingProfileRow, region: '서울' }]), null);
});
