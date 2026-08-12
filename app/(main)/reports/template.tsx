import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function ReportsTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
