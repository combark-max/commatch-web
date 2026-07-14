import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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

  try {
    const { data: profile, error: profileReadError } = await admin
      .from('profiles')
      .select('profile_image')
      .eq('id', userId)
      .maybeSingle();
    if (profileReadError) throw profileReadError;

    const imagePath = normalizeStoragePath(profile?.profile_image ?? null);
    if (imagePath) {
      const { error } = await admin.storage.from('profile_images').remove([imagePath]);
      if (error) throw error;
    }

    const { error: favoritesError } = await admin
      .from('favorites')
      .delete()
      .or(`user_id.eq.${userId},favorite_user_id.eq.${userId}`);
    if (favoritesError) throw favoritesError;

    const { error: preferencesError } = await admin.from('preferences').delete().eq('user_id', userId);
    if (preferencesError) throw preferencesError;

    const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', userId);
    if (profileDeleteError) throw profileDeleteError;

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('Auth 사용자 삭제 실패 (관련 데이터는 이미 삭제됨):', {
        userId,
        message: deleteUserError.message,
        code: deleteUserError.code ?? null,
        status: deleteUserError.status ?? null,
      });
      return NextResponse.json({ message: '계정 데이터 정리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('회원탈퇴 처리 실패:', { userId, error });
    return NextResponse.json({ message: '회원탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
