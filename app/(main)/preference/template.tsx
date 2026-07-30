import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function PreferenceTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
