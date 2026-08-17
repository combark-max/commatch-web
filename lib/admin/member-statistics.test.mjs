import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdminMemberStatistics } from './member-statistics.ts';

const validRow = {
  total_members: 4,
  membership_tiers: [
    { category: 'general', count: 3 },
    { category: 'premium', count: 1 },
  ],
  gender: [
    { category: 'male', count: 2 },
    { category: 'female', count: '1' },
    { category: 'other_or_unspecified', count: 1 },
  ],
  age_groups: [
    { category: 'under_20', count: 0 },
    { category: '20s', count: 1 },
    { category: '30s', count: 1 },
    { category: '40s', count: 1 },
    { category: '50s', count: 0 },
    { category: '60_plus', count: 0 },
    { category: 'unspecified', count: 1 },
  ],
  regions: [
    { category: '서울특별시', count: 3 },
    { category: '미입력', count: 1 },
  ],
  marriage_history: [
    { category: 'first_marriage', count: 2 },
    { category: 'remarriage', count: 1 },
    { category: 'unspecified', count: 1 },
  ],
};

test('member statistics parser accepts a valid response', () => {
  const parsed = parseAdminMemberStatistics([validRow]);
  assert.equal(parsed.totalMembers, 4);
  assert.equal(parsed.membershipTiers[1].count, 1);
  assert.equal(parsed.gender[1].count, 1);
  assert.deepEqual(parsed.regions.map((entry) => entry.category), ['서울특별시', '미입력']);
});

for (const [name, mutate] of [
  ['malformed total count', (row) => { row.total_members = '4.5'; }],
  ['malformed membership tier', (row) => { row.membership_tiers[0].category = 'standard'; }],
  ['duplicate membership tier', (row) => { row.membership_tiers[1].category = 'general'; }],
  ['membership tier sum mismatch', (row) => { row.membership_tiers[0].count = 2; }],
  ['negative count', (row) => { row.gender[0].count = -1; }],
  ['malformed category', (row) => { row.gender[0].category = 'unknown'; }],
  ['duplicate category', (row) => { row.gender[1].category = 'male'; }],
  ['malformed region entry', (row) => { row.regions[0].category = '   '; }],
  ['malformed age group', (row) => { row.age_groups[1].category = 'twenties'; }],
  ['malformed marriage category', (row) => { row.marriage_history[0].category = 'never_married'; }],
  ['empty fixed arrays', (row) => { row.gender = []; }],
]) {
  test(`member statistics parser rejects ${name}`, () => {
    const row = structuredClone(validRow);
    mutate(row);
    assert.throws(() => parseAdminMemberStatistics([row]));
  });
}

test('member statistics parser accepts the explicit empty-population contract', () => {
  const row = structuredClone(validRow);
  row.total_members = 0;
  row.membership_tiers.forEach((entry) => { entry.count = 0; });
  row.gender.forEach((entry) => { entry.count = 0; });
  row.age_groups.forEach((entry) => { entry.count = 0; });
  row.regions = [];
  row.marriage_history.forEach((entry) => { entry.count = 0; });
  assert.equal(parseAdminMemberStatistics([row]).totalMembers, 0);
});
