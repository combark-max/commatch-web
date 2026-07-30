import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
