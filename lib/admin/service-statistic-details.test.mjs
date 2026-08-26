import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_SERVICE_STATISTIC_METRICS,
  isAdminServiceStatisticMetric,
  normalizeAdminServiceStatisticPage,
  parseAdminServiceStatisticDetails,
} from './service-statistic-details.ts';

const FIRST_ID = 'c692c612-4499-4802-9b45-611e4f132ac0';
const SECOND_ID = 'c692c612-4499-4802-9b45-611e4f132ac1';
const ITEM_ID = 'c692c612-4499-4802-9b45-611e4f132ac2';
const TIMESTAMP = '2026-08-25T10:00:00.000Z';

const baseRow = {
  metric: 'total_matches', item_id: ITEM_ID, item_created_at: TIMESTAMP,
  match_id: null, match_status: 'active', matched_at: TIMESTAMP, ended_at: null,
  primary_user_id: FIRST_ID, primary_nickname: '첫 회원', primary_member_exists: true, primary_profile_exists: true,
  secondary_user_id: SECOND_ID, secondary_nickname: '둘째 회원', secondary_member_exists: true, secondary_profile_exists: true,
  message_moderation_visibility: null, member_profile_status: null,
  member_profile_visibility: null, member_account_status: null, member_premium_status: null,
  report_target_type: null, report_reason: null, report_status: null, total_count: '1',
};

test('metric allowlist accepts only the six approved values', () => {
  for (const metric of ADMIN_SERVICE_STATISTIC_METRICS) assert.equal(isAdminServiceStatisticMetric(metric), true);
  for (const metric of ['', 'matches', 'TOTAL_MATCHES', null, ['total_matches']]) assert.equal(isAdminServiceStatisticMetric(metric), false);
});

test('page normalization accepts bounded positive integers', () => {
  assert.equal(normalizeAdminServiceStatisticPage('2', 10), 2);
  for (const value of [undefined, '', '0', '-1', '1.5', '999999999999999999']) {
    assert.equal(normalizeAdminServiceStatisticPage(value, 10), 1);
  }
});

test('match parser validates metric-specific status and users', () => {
  const parsed = parseAdminServiceStatisticDetails([baseRow], 'total_matches');
  assert.equal(parsed?.[0]?.kind, 'match');
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, metric: 'active_matches' }], 'active_matches')?.length, 1);
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, metric: 'ended_matches' }], 'ended_matches'), null);
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, ended_at: TIMESTAMP }], 'total_matches'), null);
});

test('message parser accepts metadata without a content field', () => {
  const row = {
    ...baseRow, metric: 'total_messages', match_id: SECOND_ID, match_status: null,
    matched_at: null, message_moderation_visibility: 'hidden', secondary_user_id: null,
    secondary_nickname: null, secondary_member_exists: null, secondary_profile_exists: null,
  };
  const parsed = parseAdminServiceStatisticDetails([row], 'total_messages');
  assert.equal(parsed?.[0]?.kind, 'message');
  assert.equal(Object.hasOwn(parsed?.[0] ?? {}, 'content'), false);
});

test('member parser accepts missing profiles and approved current states', () => {
  const row = {
    ...baseRow, metric: 'recent_members', item_id: FIRST_ID, match_status: null, matched_at: null,
    primary_nickname: null, primary_profile_exists: false, secondary_user_id: null,
    secondary_nickname: null, secondary_member_exists: null, secondary_profile_exists: null,
    member_profile_status: 'missing', member_profile_visibility: null,
    member_account_status: 'suspended', member_premium_status: 'none',
  };
  assert.equal(parseAdminServiceStatisticDetails([row], 'recent_members')?.[0]?.kind, 'member');
});

test('report parser validates existing report list enums', () => {
  const row = {
    ...baseRow, metric: 'recent_reports', match_status: null, matched_at: null,
    report_target_type: 'message', report_reason: 'spam', report_status: 'reviewing',
  };
  assert.equal(parseAdminServiceStatisticDetails([row], 'recent_reports')?.[0]?.kind, 'report');
  assert.equal(parseAdminServiceStatisticDetails([{ ...row, report_status: 'closed' }], 'recent_reports'), null);
});

test('parser rejects malformed wire values and accepts empty results', () => {
  assert.equal(parseAdminServiceStatisticDetails([], 'total_matches')?.length, 0);
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, item_id: 'bad-id' }], 'total_matches'), null);
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, total_count: -1 }], 'total_matches'), null);
  assert.equal(parseAdminServiceStatisticDetails([{ ...baseRow, metric: 'ended_matches' }], 'total_matches'), null);
});
