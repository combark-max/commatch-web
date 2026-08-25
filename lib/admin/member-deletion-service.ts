import 'server-only';

import { getCurrentAdminAccess } from '@/lib/admin/access';
import {
  parseAdminMemberDeletionResultUpdate,
  type AdminMemberDeletionFailureStage,
} from '@/lib/admin/member-deletions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DeleteAdminMemberResult =
  | { kind: 'success' }
  | {
    kind: 'error';
    stage: AdminMemberDeletionFailureStage;
    message: string;
    auditRecorded: boolean;
  };

const normalizeStoragePath = (value: string | null): string | null => {
  if (!value) return null;
  const marker = '/storage/v1/object/public/profile_images/';
  const index = value.indexOf(marker);
  try {
    return decodeURIComponent(index >= 0 ? value.slice(index + marker.length) : value.replace(/^\/+/, ''));
  } catch {
    return null;
  }
};

export async function deleteAdminMember({
  requestId,
  targetUserId,
}: {
  requestId: string;
  targetUserId: string;
}): Promise<DeleteAdminMemberResult> {
  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();

  const recordResult = async (
    status: 'completed' | 'failed',
    failureStage: AdminMemberDeletionFailureStage | null,
  ): Promise<boolean> => {
    const { data, error } = await supabase.rpc('set_admin_member_deletion_result', {
      p_request_id: requestId,
      p_status: status,
      p_failure_stage: failureStage,
    });
    const result = parseAdminMemberDeletionResultUpdate(data);
    return !error
      && result?.requestId.toLowerCase() === requestId.toLowerCase()
      && result.status === status;
  };

  const fail = async (
    stage: AdminMemberDeletionFailureStage,
    message: string,
  ): Promise<DeleteAdminMemberResult> => ({
    kind: 'error',
    stage,
    message,
    auditRecorded: await recordResult('failed', stage),
  });

  const accessLookup = await getCurrentAdminAccess();
  if (
    accessLookup.kind !== 'valid'
    || !accessLookup.access.isAdmin
    || accessLookup.access.status !== 'active'
    || accessLookup.access.role !== 'super_admin'
  ) {
    return fail('database', '강제탈퇴를 실행할 active super_admin 권한이 없습니다.');
  }

  const getTargetAdmin = async () => admin
    .from('admin_accounts')
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  const initialAdminCheck = await getTargetAdmin();
  if (initialAdminCheck.error) {
    return fail('database', '대상 계정의 관리자 등록 여부를 확인하지 못했습니다.');
  }
  if (initialAdminCheck.data) {
    return fail('database', '관리자 계정은 강제탈퇴시킬 수 없습니다.');
  }

  const targetAuthResult = await admin.auth.admin.getUserById(targetUserId);
  if (targetAuthResult.error || !targetAuthResult.data.user) {
    return fail('database', '강제탈퇴 대상 회원을 찾을 수 없습니다.');
  }

  const { data: profileWithImages, error: profileReadError } = await admin
    .from('profiles')
    .select('profile_image, profile_images')
    .eq('id', targetUserId)
    .maybeSingle();
  let profile: { profile_image?: string | null; profile_images?: unknown } | null = profileWithImages;

  if (profileReadError) {
    const { data: legacyProfile, error: legacyProfileReadError } = await admin
      .from('profiles')
      .select('profile_image')
      .eq('id', targetUserId)
      .maybeSingle();
    if (legacyProfileReadError) {
      return fail('database', '대상 회원의 프로필 이미지 정보를 확인하지 못했습니다.');
    }
    profile = legacyProfile;
  }

  const imagePaths = Array.from(new Set([
    profile?.profile_image ?? null,
    ...(Array.isArray(profile?.profile_images) ? profile.profile_images : []),
  ]
    .map((value) => typeof value === 'string' ? normalizeStoragePath(value) : null)
    .filter((value): value is string => value !== null && value.startsWith(`${targetUserId}/`))));

  const preDeleteAdminCheck = await getTargetAdmin();
  if (preDeleteAdminCheck.error) {
    return fail('database', '삭제 직전 대상 계정의 관리자 등록 여부를 확인하지 못했습니다.');
  }
  if (preDeleteAdminCheck.data) {
    return fail('database', '삭제 직전 관리자 계정으로 확인되어 강제탈퇴를 중단했습니다.');
  }

  if (imagePaths.length > 0) {
    const { error } = await admin.storage.from('profile_images').remove(imagePaths);
    if (error) return fail('storage', '프로필 이미지 삭제 단계에서 강제탈퇴가 중단되었습니다.');
  }

  const { error: favoritesError } = await admin
    .from('favorites')
    .delete()
    .or(`user_id.eq.${targetUserId},favorite_user_id.eq.${targetUserId}`);
  if (favoritesError) return fail('database', '관심회원 데이터 삭제 단계에서 강제탈퇴가 중단되었습니다.');

  const { error: preferencesError } = await admin
    .from('preferences')
    .delete()
    .eq('user_id', targetUserId);
  if (preferencesError) return fail('database', '이상형 데이터 삭제 단계에서 강제탈퇴가 중단되었습니다.');

  const { error: profileDeleteError } = await admin
    .from('profiles')
    .delete()
    .eq('id', targetUserId);
  if (profileDeleteError) return fail('database', '프로필 데이터 삭제 단계에서 강제탈퇴가 중단되었습니다.');

  const finalAdminCheck = await getTargetAdmin();
  if (finalAdminCheck.error) {
    return fail('database', 'Auth 삭제 직전 관리자 등록 여부를 확인하지 못했습니다.');
  }
  if (finalAdminCheck.data) {
    return fail('database', 'Auth 삭제 직전 관리자 계정으로 확인되어 강제탈퇴를 중단했습니다.');
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) return fail('auth', 'Auth 사용자 삭제 단계에서 강제탈퇴가 중단되었습니다.');

  if (!await recordResult('completed', null)) {
    return fail('database', '회원 데이터는 삭제되었지만 감사기록 완료 상태를 저장하지 못했습니다.');
  }

  return { kind: 'success' };
}
