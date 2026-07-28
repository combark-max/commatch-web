import { redirect } from 'next/navigation';
import { getPremiumFeatureAccess } from '@/lib/premium/server';
import LikesReceivedClient from './likes-received-client';

export default async function LikesReceivedPage() {
  const access = await getPremiumFeatureAccess('likes_received');

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (!access.allowed) {
    redirect('/premium');
  }

  return <LikesReceivedClient />;
}
