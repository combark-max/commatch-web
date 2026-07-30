import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function FavoritesTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
