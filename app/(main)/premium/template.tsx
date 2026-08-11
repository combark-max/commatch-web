import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function PremiumTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
