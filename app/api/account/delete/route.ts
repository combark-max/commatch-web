import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type AccountDeletionFailureStage =
  | 'profile_lookup'
  | 'storage_delete'
  | 'favorites_delete'
  | 'preferences_delete'
  | 'profile_delete'
  | 'auth_delete';

const PARTIAL_CLEANUP_RETRY_MESSAGE =
  '회원탈퇴 처리 중 오류가 발생했습니다. 일부 데이터가 이미 정리되었을 수 있으니 같은 화면에서 다시 시도해 주세요.';
const AUTH_DELETE_RETRY_MESSAGE =
  '계정 데이터 정리는 진행되었지만 로그인 계정 삭제를 완료하지 못했습니다. 같은 화면에서 다시 시도해 주세요.';

const normalizeStoragePath = (value: string | null) => {
  if (!value) return null;
  const marker = '/storage/v1/object/public/profile_images/';
  const index = value.indexOf(marker);
  try {
    return decodeURIComponent(index >= 0 ? value.slice(index + marker.length) : value.replace(/^\/+/, ''));
  } catch {
    return null;
  }
};

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const userId = user.id;
  let failureStage: AccountDeletionFailureStage = 'profile_lookup';

  try {
    const { data: profileWithImages, error: profileReadError } = await admin
      .from('profiles')
      .select('profile_image, profile_images')
      .eq('id', userId)
      .maybeSingle();
    let profile: { profile_image?: string | null; profile_images?: unknown } | null = profileWithImages;

    if (profileReadError) {
      const { data: legacyProfile, error: legacyProfileReadError } = await admin
        .from('profiles')
        .select('profile_image')
        .eq('id', userId)
        .maybeSingle();
      if (legacyProfileReadError) throw legacyProfileReadError;
      profile = legacyProfile;
    }

    const storedImageValues = [
      profile?.profile_image ?? null,
      ...(Array.isArray(profile?.profile_images) ? profile.profile_images : []),
    ];
    const imagePaths = Array.from(new Set(
      storedImageValues
        .map((value) => typeof value === 'string' ? normalizeStoragePath(value) : null)
        .filter((value): value is string => value !== null && value.startsWith(`${userId}/`)),
    ));

    if (imagePaths.length > 0) {
      failureStage = 'storage_delete';
      const { error } = await admin.storage.from('profile_images').remove(imagePaths);
      if (error) throw error;
    }

    failureStage = 'favorites_delete';
    const { error: favoritesError } = await admin
      .from('favorites')
      .delete()
      .or(`user_id.eq.${userId},favorite_user_id.eq.${userId}`);
    if (favoritesError) throw favoritesError;

    failureStage = 'preferences_delete';
    const { error: preferencesError } = await admin.from('preferences').delete().eq('user_id', userId);
    if (preferencesError) throw preferencesError;

    failureStage = 'profile_delete';
    const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', userId);
    if (profileDeleteError) throw profileDeleteError;

    failureStage = 'auth_delete';
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorDetails = error && typeof error === 'object'
      ? error as { message?: unknown; code?: unknown }
      : null;
    console.error('회원탈퇴 처리 실패:', {
      userId,
      stage: failureStage,
      message: typeof errorDetails?.message === 'string' ? errorDetails.message : 'Unknown error',
      code: typeof errorDetails?.code === 'string' ? errorDetails.code : null,
    });
    return NextResponse.json(
      { message: failureStage === 'auth_delete' ? AUTH_DELETE_RETRY_MESSAGE : PARTIAL_CLEANUP_RETRY_MESSAGE },
      { status: 500 },
    );
  }
}
