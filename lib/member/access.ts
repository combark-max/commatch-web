import 'server-only';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assessConsentAccess, getCurrentConsentStatus } from '@/lib/consent/server';
import {
  parseMemberAccessRpcResponse,
  type MemberAccess,
} from '@/lib/member/access-parser';

export type MemberAccessLookup =
  | { kind: 'anonymous' }
  | { kind: 'error' }
  | { kind: 'valid'; access: MemberAccess };

export type MemberServiceAccessLookup =
  | { kind: 'anonymous' }
  | { kind: 'error' }
  | { kind: 'suspended'; access: MemberAccess }
  | { kind: 'consent_required'; access: MemberAccess }
  | { kind: 'allowed'; access: MemberAccess };

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
  const lookup = await getCurrentMemberServiceAccess();

  if (lookup.kind === 'anonymous') redirect('/login');
  if (lookup.kind === 'error' || lookup.kind === 'suspended') redirect('/account-suspended');
  if (lookup.kind === 'consent_required') redirect('/consent');

  return lookup.access;
}

export async function getCurrentMemberServiceAccess(): Promise<MemberServiceAccessLookup> {
  const lookup = await getCurrentMemberAccess();

  if (lookup.kind !== 'valid') return lookup;
  if (!lookup.access.isAllowed) return { kind: 'suspended', access: lookup.access };

  const consentLookup = await getCurrentConsentStatus();
  if (consentLookup.kind === 'anonymous') return { kind: 'anonymous' };
  if (consentLookup.kind === 'error') return { kind: 'consent_required', access: lookup.access };

  const consentAccess = assessConsentAccess(
    consentLookup.user.createdAt,
    consentLookup.latestByType,
  );
  if (!consentAccess.canAccess) return { kind: 'consent_required', access: lookup.access };

  return { kind: 'allowed', access: lookup.access };
}
