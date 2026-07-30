import 'server-only';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  parseMemberAccessRpcResponse,
  type MemberAccess,
} from '@/lib/member/access-parser';

export type MemberAccessLookup =
  | { kind: 'anonymous' }
  | { kind: 'error' }
  | { kind: 'valid'; access: MemberAccess };

export async function getCurrentMemberAccess(): Promise<MemberAccessLookup> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) return { kind: 'anonymous' };
  if (userError) return { kind: 'error' };

  const { data, error } = await supabase.rpc('get_my_member_access');
  if (error) return { kind: 'error' };

  const access = parseMemberAccessRpcResponse(data);
  return access ? { kind: 'valid', access } : { kind: 'error' };
}

export async function requireMemberServiceAccess(): Promise<MemberAccess> {
  const lookup = await getCurrentMemberAccess();

  if (lookup.kind === 'anonymous') redirect('/login');
  if (lookup.kind === 'error' || !lookup.access.isAllowed) {
    redirect('/account-suspended');
  }

  return lookup.access;
}
