import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ComMatch',
    short_name: 'ComMatch',
    description: 'AI 기반 결혼 매칭 서비스 ComMatch',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#2E7D32',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
