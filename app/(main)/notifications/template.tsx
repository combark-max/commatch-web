import MemberServiceAccessBoundary from '@/components/member/MemberServiceAccessBoundary';

export default function NotificationsTemplate({ children }: { children: React.ReactNode }) {
  return <MemberServiceAccessBoundary>{children}</MemberServiceAccessBoundary>;
}
