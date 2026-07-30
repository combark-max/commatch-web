import type { AdminRole } from '@/lib/admin/access';

const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  moderator: '신고 관리자',
};

export const getAdminRoleLabel = (role: AdminRole): string => (
  ADMIN_ROLE_LABELS[role] ?? '관리자'
);
