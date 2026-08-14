import { redirect } from 'next/navigation';
import { requireMemberServiceAccess } from '@/lib/member/access';
import { getPremiumFeatureAccess } from '@/lib/premium/server';
import ReceivedLikesClient from './received-likes-client';

export default async function ReceivedLikesPage() {
  await requireMemberServiceAccess();

  const access = await getPremiumFeatureAccess('received_likes');

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (!access.allowed) {
    redirect('/premium');
  }

  return <ReceivedLikesClient />;
}
