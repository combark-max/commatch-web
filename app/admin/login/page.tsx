import { redirect } from 'next/navigation';
import AdminLoginForm, { type InitialAdminLoginState } from '@/components/admin/AdminLoginForm';
import { getCurrentAdminAccess } from '@/lib/admin/access';

export default async function AdminLoginPage() {
  const lookup = await getCurrentAdminAccess();

  if (
    lookup.kind === 'valid'
    && lookup.access.isAdmin === true
    && lookup.access.status === 'active'
    && lookup.access.permissions.includes('admin_dashboard_view')
  ) {
    redirect('/admin');
  }

  let initialState: InitialAdminLoginState = null;
  if (lookup.kind === 'error') {
    initialState = { kind: 'error' };
  } else if (
    lookup.kind === 'valid'
    && !(lookup.access.isAdmin === false && lookup.access.role === null && lookup.access.status === null)
  ) {
    initialState = { kind: 'denied', access: lookup.access };
  }

  return <AdminLoginForm initialState={initialState} />;
}
