import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const interactionModule = await import('../components/common/profile-image-interaction.ts')
  .catch(() => ({}));
const {
  PROFILE_IMAGE_INTERACTION_CLASS,
  profileImageInteractionProps,
} = interactionModule;

const matchesPage = readFileSync(
  new URL('../app/(main)/matches/page.tsx', import.meta.url),
  'utf8',
);
const imageModal = readFileSync(
  new URL('../components/common/ImageModal.tsx', import.meta.url),
  'utf8',
);

test('mobile match cards use a smaller square thumbnail and restore the existing desktop layout', () => {
  assert.match(
    matchesPage,
    /flex h-40 items-center justify-center overflow-hidden p-4 sm:h-auto sm:w-44 sm:shrink-0/,
  );
  assert.match(
    matchesPage,
    /h-32 w-32 max-w-full cursor-zoom-in[\s\S]*sm:h-full sm:w-full sm:max-w-none/,
  );
  assert.match(matchesPage, /h-full w-full rounded-2xl object-cover/);
});

test('profile image interaction helper suppresses selection, touch callouts, dragging, and context menus', () => {
  assert.equal(profileImageInteractionProps?.draggable, false);
  assert.match(PROFILE_IMAGE_INTERACTION_CLASS ?? '', /select-none/);
  assert.match(PROFILE_IMAGE_INTERACTION_CLASS ?? '', /\[-webkit-touch-callout:none\]/);
  assert.match(PROFILE_IMAGE_INTERACTION_CLASS ?? '', /\[-webkit-user-drag:none\]/);

  let prevented = false;
  profileImageInteractionProps?.onContextMenu({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
});

test('profile image interaction suppression is wired to major user images without blocking modal clicks', () => {
  const clientImageFiles = [
    '../app/(main)/dashboard/page.tsx',
    '../app/(main)/ai-match/page.tsx',
    '../app/(main)/members/members-client.tsx',
    '../app/(main)/members/[id]/page.tsx',
    '../app/(main)/favorites/page.tsx',
    '../app/(main)/matches/page.tsx',
    '../app/(main)/matches/[matchId]/chat/page.tsx',
    '../app/(main)/premium/likes-received/likes-received-client.tsx',
    '../app/(main)/premium/received-likes/received-likes-client.tsx',
    '../app/(main)/profile/create/page.tsx',
    '../components/common/ImageModal.tsx',
  ];

  for (const relativePath of clientImageFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /profileImageInteractionProps/, `${relativePath} must use the shared interaction props`);
    assert.match(source, /PROFILE_IMAGE_INTERACTION_CLASS/, `${relativePath} must use the shared interaction class`);
  }

  const interactionSource = readFileSync(
    new URL('../components/common/profile-image-interaction.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(interactionSource, /pointer-events|touch-action|onTouchStart/);

  assert.match(imageModal, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(imageModal, /max-h-\[85vh\] max-w-\[90vw\][\s\S]*object-contain/);
});

test('match card batching leaves modal images on the existing protected single-image URL', () => {
  assert.match(matchesPage, /const thumbnailUrl = getProfileImageDisplayUrl\(/);
  assert.match(matchesPage, /url: match\.profileImageUrl \?\? ''/);
  assert.match(matchesPage, /<ImageModal[\s\S]*?imageUrl=\{selectedImage\.url\}/);
});
