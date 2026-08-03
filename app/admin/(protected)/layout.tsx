import AdminShell from '@/components/admin/AdminShell';
import { requireAdminAccess } from '@/lib/admin/access';
import { getAdminRoleLabel } from '@/lib/admin/presentation';

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminAccess = await requireAdminAccess('admin_dashboard_view');

  return (
    <AdminShell
      roleLabel={getAdminRoleLabel(adminAccess.role)}
      canViewReports={adminAccess.permissions.includes('reports_view')}
      canViewPremium={adminAccess.permissions.includes('premium_memberships_view')}
      canManageAdmins={adminAccess.permissions.includes('admin_accounts_manage')}
    >
      {children}
    </AdminShell>
  );
}
