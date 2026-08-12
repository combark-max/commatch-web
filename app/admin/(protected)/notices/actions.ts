'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isNoticeStatus,
  isUuid,
  parseNoticeMutationResult,
} from '@/lib/support/notices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const getText = (formData: FormData, key: string): string | null => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : null;
};

const getErrorKey = (code: string | undefined, message: string | undefined): string => {
  if (code === 'P0001' && message?.includes('NOTICE_STALE_VERSION')) return 'stale';
  if (code === 'P0002') return 'not-found';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'validation';
  return 'save-failed';
};

const revalidateNoticePaths = (noticeId?: string) => {
  revalidatePath('/notices');
  revalidatePath('/admin/notices');
  if (noticeId) {
    revalidatePath(`/notices/${noticeId}`);
    revalidatePath(`/admin/notices/${noticeId}`);
  }
};

export async function createAdminNoticeAction(formData: FormData): Promise<void> {
  await requireAdminAccess('notices_manage');
  const title = getText(formData, 'title')?.trim() ?? '';
  const body = getText(formData, 'body')?.trim() ?? '';
  if (title.length < 1 || title.length > 150 || body.length < 1 || body.length > 10000) {
    redirect('/admin/notices/new?error=validation');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('create_admin_notice', {
    p_title: title,
    p_body: body,
  });
  if (error) redirect(`/admin/notices/new?error=${getErrorKey(error.code, error.message)}`);

  const noticeId = parseNoticeMutationResult(data);
  if (!noticeId) redirect('/admin/notices/new?error=save-failed');

  revalidateNoticePaths(noticeId);
  redirect(`/admin/notices/${noticeId}?result=created`);
}

export async function updateAdminNoticeAction(formData: FormData): Promise<void> {
  await requireAdminAccess('notices_manage');
  const noticeId = getText(formData, 'noticeId');
  const expectedUpdatedAt = getText(formData, 'expectedUpdatedAt');
  const title = getText(formData, 'title')?.trim() ?? '';
  const body = getText(formData, 'body')?.trim() ?? '';
  const fallbackPath = isUuid(noticeId) ? `/admin/notices/${noticeId}` : '/admin/notices';

  if (
    !isUuid(noticeId)
    || !expectedUpdatedAt
    || Number.isNaN(Date.parse(expectedUpdatedAt))
    || title.length < 1
    || title.length > 150
    || body.length < 1
    || body.length > 10000
  ) redirect(`${fallbackPath}?error=validation`);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('update_admin_notice', {
    p_notice_id: noticeId,
    p_expected_updated_at: expectedUpdatedAt,
    p_title: title,
    p_body: body,
  });
  if (error) redirect(`${fallbackPath}?error=${getErrorKey(error.code, error.message)}`);
  if (parseNoticeMutationResult(data) !== noticeId) redirect(`${fallbackPath}?error=save-failed`);

  revalidateNoticePaths(noticeId);
  redirect(`${fallbackPath}?result=updated`);
}

export async function changeAdminNoticeStatusAction(formData: FormData): Promise<void> {
  await requireAdminAccess('notices_manage');
  const noticeId = getText(formData, 'noticeId');
  const expectedUpdatedAt = getText(formData, 'expectedUpdatedAt');
  const newStatus = getText(formData, 'newStatus');
  const fallbackPath = isUuid(noticeId) ? `/admin/notices/${noticeId}` : '/admin/notices';

  if (
    !isUuid(noticeId)
    || !expectedUpdatedAt
    || Number.isNaN(Date.parse(expectedUpdatedAt))
    || !isNoticeStatus(newStatus)
  ) redirect(`${fallbackPath}?error=validation`);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('change_admin_notice_status', {
    p_notice_id: noticeId,
    p_expected_updated_at: expectedUpdatedAt,
    p_new_status: newStatus,
  });
  if (error) redirect(`${fallbackPath}?error=${getErrorKey(error.code, error.message)}`);
  if (parseNoticeMutationResult(data) !== noticeId) redirect(`${fallbackPath}?error=save-failed`);

  revalidateNoticePaths(noticeId);
  redirect(`${fallbackPath}?result=${newStatus}`);
}
