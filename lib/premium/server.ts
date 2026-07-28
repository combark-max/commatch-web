import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type PremiumFeatureKey =
  | 'likes_received'
  | 'advanced_member_search'
  | 'expanded_recommendations';

export type PremiumAccessResult =
  | {
      status: 'unauthenticated';
      user: null;
      allowed: false;
    }
  | {
      status: 'forbidden';
      user: User;
      allowed: false;
    }
  | {
      status: 'allowed';
      user: User;
      allowed: true;
    };

export async function getPremiumFeatureAccess(
  featureKey: PremiumFeatureKey,
): Promise<PremiumAccessResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 'unauthenticated',
      user: null,
      allowed: false,
    };
  }

  const { data: hasAccess, error: accessError } = await supabase.rpc(
    'has_premium_feature',
    { p_feature_key: featureKey },
  );

  if (accessError || hasAccess !== true) {
    return {
      status: 'forbidden',
      user,
      allowed: false,
    };
  }

  return {
    status: 'allowed',
    user,
    allowed: true,
  };
}
