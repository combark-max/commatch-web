import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function AiMatchTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
