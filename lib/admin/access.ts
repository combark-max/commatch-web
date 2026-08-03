import 'server-only';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AdminPermission =
  | 'admin_dashboard_view'
  | 'reports_view'
  | 'reports_manage'
  | 'admin_accounts_manage'
  | 'member_restrictions_view'
  | 'member_restrictions_manage'
  | 'premium_memberships_view'
  | 'premium_memberships_manage';

export type AdminRole = 'super_admin' | 'admin' | 'moderator';

export type AdminStatus = 'active' | 'suspended' | 'revoked';

export type AdminAccessSnapshot = {
  isAdmin: boolean;
  role: AdminRole | null;
  status: AdminStatus | null;
  permissions: AdminPermission[];
};

export type AdminAccessLookup =
  | { kind: 'anonymous' }
  | { kind: 'error' }
  | { kind: 'valid'; access: AdminAccessSnapshot };

export type AdminAccess = {
  role: AdminRole;
  status: 'active';
  permissions: AdminPermission[];
};

const ADMIN_ROLES = new Set<AdminRole>([
  'super_admin',
  'admin',
  'moderator',
]);

const ADMIN_STATUSES = new Set<AdminStatus>([
  'active',
  'suspended',
  'revoked',
]);

const ADMIN_PERMISSIONS = new Set<AdminPermission>([
  'admin_dashboard_view',
  'reports_view',
  'reports_manage',
  'admin_accounts_manage',
  'member_restrictions_view',
  'member_restrictions_manage',
  'premium_memberships_view',
  'premium_memberships_manage',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const parsePermissions = (value: unknown): AdminPermission[] | null => {
  if (value === null) return [];
  if (!Array.isArray(value)) return null;

  const permissions: AdminPermission[] = [];
  for (const permission of value) {
    if (typeof permission !== 'string' || !ADMIN_PERMISSIONS.has(permission as AdminPermission)) {
      return null;
    }
    permissions.push(permission as AdminPermission);
  }

  return new Set(permissions).size === permissions.length ? permissions : null;
};

const parseAdminAccess = (value: unknown): AdminAccessSnapshot | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  const role = row.role === null
    ? null
    : typeof row.role === 'string' && ADMIN_ROLES.has(row.role as AdminRole)
      ? row.role as AdminRole
      : undefined;
  const status = row.status === null
    ? null
    : typeof row.status === 'string' && ADMIN_STATUSES.has(row.status as AdminStatus)
      ? row.status as AdminStatus
      : undefined;
  const permissions = parsePermissions(row.permissions);
  if (
    typeof row.is_admin !== 'boolean'
    || role === undefined
    || status === undefined
    || permissions === null
  ) {
    return null;
  }

  return {
    isAdmin: row.is_admin,
    role,
    status,
    permissions,
  };
};

export async function getCurrentAdminAccess(): Promise<AdminAccessLookup> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) return { kind: 'anonymous' };
  if (userError) return { kind: 'error' };

  const { data, error } = await supabase.rpc('get_my_admin_access');
  if (error) return { kind: 'error' };

  const access = parseAdminAccess(data);
  return access ? { kind: 'valid', access } : { kind: 'error' };
}

export async function requireAdminAccess(
  permission?: AdminPermission,
): Promise<AdminAccess> {
  const lookup = await getCurrentAdminAccess();
  if (lookup.kind !== 'valid') redirect('/admin/login');

  const access = lookup.access;
  if (access.isAdmin !== true || access.status !== 'active' || !access.role) {
    redirect('/admin/login');
  }
  if (permission && !access.permissions.includes(permission)) redirect('/admin/login');

  return {
    role: access.role,
    status: 'active',
    permissions: access.permissions,
  };
}
