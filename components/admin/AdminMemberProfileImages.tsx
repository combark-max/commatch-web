'use client';

import { useCallback, useState } from 'react';
import ImageModal from '@/components/common/ImageModal';

type AdminMemberProfileImagesProps = {
  imageUrls: string[];
  memberLabel: string;
};

export default function AdminMemberProfileImages({
  imageUrls,
  memberLabel,
}: AdminMemberProfileImagesProps) {
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const visibleImageUrls = imageUrls.filter((imageUrl) => !failedImageUrls.has(imageUrl));

  const closeModal = useCallback(() => setSelectedImageUrl(null), []);
  const handleImageError = (imageUrl: string) => {
    setFailedImageUrls((current) => new Set(current).add(imageUrl));
    if (selectedImageUrl === imageUrl) closeModal();
  };
  const selectedIndex = selectedImageUrl === null ? -1 : imageUrls.indexOf(selectedImageUrl);
  const selectedAlt = `${memberLabel} 프로필 사진 ${selectedIndex + 1}`;

  return (
    <>
      {visibleImageUrls.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibleImageUrls.map((imageUrl) => {
            const imageIndex = imageUrls.indexOf(imageUrl);
            const alt = `${memberLabel} 프로필 사진 ${imageIndex + 1}`;
            return (
              <button
                key={imageUrl}
                type="button"
                aria-label={`${alt} 크게 보기`}
                onClick={() => setSelectedImageUrl(imageUrl)}
                className="aspect-square overflow-hidden rounded-2xl bg-gray-100 transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                {/* Public storage URLs are generated at runtime and do not have fixed dimensions. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={alt}
                  onError={() => handleImageError(imageUrl)}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">
          표시할 프로필 사진이 없습니다.
        </p>
      )}

      {selectedImageUrl ? (
        <ImageModal
          key={selectedImageUrl}
          isOpen
          imageUrl={selectedImageUrl}
          alt={selectedAlt}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
}
