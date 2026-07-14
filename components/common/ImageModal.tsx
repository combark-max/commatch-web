'use client';

import { useEffect, useRef, useState } from 'react';
import { User, X } from 'lucide-react';

type ImageModalProps = {
  isOpen: boolean;
  imageUrl: string | null;
  alt: string;
  onClose: () => void;
};

export default function ImageModal({ isOpen, imageUrl, alt, onClose }: ImageModalProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, imageUrl, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 확대 이미지`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6"
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="이미지 닫기"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white sm:right-6 sm:top-6"
      >
        <X size={26} />
      </button>

      <div
        className="flex max-h-[85vh] max-w-[90vw] items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        {hasImageError ? (
          <div className="flex h-64 w-64 max-w-[80vw] items-center justify-center rounded-2xl bg-white text-gray-300 shadow-2xl">
            <User size={96} strokeWidth={1.5} />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={alt}
            onError={() => setHasImageError(true)}
            className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}
