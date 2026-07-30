import { requireMemberServiceAccess } from '@/lib/member/access';

export default async function MemberServiceAccessBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMemberServiceAccess();
  return children;
}
