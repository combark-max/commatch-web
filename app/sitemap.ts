import type { MetadataRoute } from 'next';

const siteUrl = 'https://www.commatch.net';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/faq` },
    { url: `${siteUrl}/notices` },
    { url: `${siteUrl}/match-test` },
    { url: `${siteUrl}/terms` },
    { url: `${siteUrl}/privacy` },
  ];
}
