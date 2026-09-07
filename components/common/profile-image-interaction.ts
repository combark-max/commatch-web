import type { MouseEvent } from 'react';

export const PROFILE_IMAGE_INTERACTION_CLASS =
  'select-none [-webkit-touch-callout:none] [-webkit-user-drag:none]';

export const profileImageInteractionProps = {
  draggable: false,
  onContextMenu(event: MouseEvent<HTMLImageElement>) {
    event.preventDefault();
  },
};

