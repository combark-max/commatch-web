import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProfileImageUrl,
  normalizeProfileImagePath,
  parseProfileImageRequestPath,
  resolveProfileImagePath,
  resolveProfileImageUrl,
} from './profile-image.ts';

const USER_ID = 'c692c612-4499-4802-9b45-611e4f132ac0';
const PATH = `${USER_ID}/profile photo.webp`;

test('stored profile image paths resolve only through the authenticated same-origin API', () => {
  const expected = `/api/profile-images?path=${encodeURIComponent(PATH)}`;
  assert.equal(getProfileImageUrl(PATH), expected);
  assert.equal(resolveProfileImageUrl(PATH), expected);
  assert.doesNotMatch(expected, /storage\/v1\/object\/public/);
});

test('legacy public URLs keep their object path without preserving public access', () => {
  const legacy = `https://example.supabase.co/storage/v1/object/public/profile_images/${USER_ID}/avatar.jpg`;
  assert.equal(normalizeProfileImagePath(legacy), `${USER_ID}/avatar.jpg`);
  assert.equal(resolveProfileImagePath(legacy), `${USER_ID}/avatar.jpg`);
  assert.equal(resolveProfileImageUrl(legacy), `/api/profile-images?path=${encodeURIComponent(`${USER_ID}/avatar.jpg`)}`);
});

test('profile image API accepts only an owner UUID folder and a non-empty object name', () => {
  assert.equal(parseProfileImageRequestPath(PATH), PATH);
  for (const invalid of [
    null,
    '',
    'avatar.jpg',
    'not-a-uuid/avatar.jpg',
    `${USER_ID}`,
    `${USER_ID}/../avatar.jpg`,
    `${USER_ID}//avatar.jpg`,
    `/${USER_ID}/avatar.jpg`,
    `${USER_ID}/avatar.jpg/`,
    `${USER_ID}/avatar\\name.jpg`,
  ]) {
    assert.equal(parseProfileImageRequestPath(invalid), null);
  }
});
