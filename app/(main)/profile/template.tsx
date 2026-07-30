import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function ProfileTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
