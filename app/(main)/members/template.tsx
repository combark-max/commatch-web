import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function MembersTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
