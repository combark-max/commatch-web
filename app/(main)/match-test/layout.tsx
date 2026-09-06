import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: {
    canonical: '/match-test',
  },
};

export default function MatchTestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
