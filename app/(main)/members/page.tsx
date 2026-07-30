import { redirect } from 'next/navigation';
import { requireMemberServiceAccess } from '@/lib/member/access';
import { getPremiumFeatureAccess } from '@/lib/premium/server';
import MembersClient from './members-client';

type MembersPageProps = {
  searchParams: Promise<{
    advanced?: string | string[];
  }>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  await requireMemberServiceAccess();

  const [access, query] = await Promise.all([
    getPremiumFeatureAccess('advanced_member_search'),
    searchParams,
  ]);

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  const advancedRequested = query.advanced === '1';

  if (advancedRequested && !access.allowed) {
    redirect('/premium');
  }

  return (
    <MembersClient
      canUseAdvancedSearch={access.allowed}
      initialAdvancedOpen={advancedRequested && access.allowed}
    />
  );
}
