'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminAccess } from '@/lib/admin/access';
import { isUuid, parseInquiryMutationId } from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
};

const errorKey = (code?: string, message?: string) => {
  if (code === 'P0001' && message?.includes('SUPPORT_INQUIRY_STALE_VERSION')) return 'stale';
  if (code === 'P0002') return 'not-found';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'validation';
  return 'save-failed';
};

export async function answerSupportInquiryAction(formData: FormData): Promise<void> {
  await requireAdminAccess('support_inquiries_manage');
  const inquiryId = text(formData, 'inquiryId');
  const expectedUpdatedAt = text(formData, 'expectedUpdatedAt');
  const answerBody = text(formData, 'answerBody').trim();
  const path = isUuid(inquiryId) ? `/admin/inquiries/${inquiryId}` : '/admin/inquiries';
  if (!isUuid(inquiryId) || Number.isNaN(Date.parse(expectedUpdatedAt)) || answerBody.length < 1 || answerBody.length > 5000) {
    redirect(`${path}?error=validation`);
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('answer_admin_support_inquiry', {
    p_inquiry_id: inquiryId, p_expected_updated_at: expectedUpdatedAt, p_answer_body: answerBody,
  });
  if (error) redirect(`${path}?error=${errorKey(error.code, error.message)}`);
  if (parseInquiryMutationId(data) !== inquiryId) redirect(`${path}?error=save-failed`);
  revalidatePath('/admin/inquiries');
  revalidatePath(path);
  revalidatePath('/support/inquiries');
  revalidatePath(`/support/inquiries/${inquiryId}`);
  redirect(`${path}?result=answered`);
}

export async function closeSupportInquiryAction(formData: FormData): Promise<void> {
  await requireAdminAccess('support_inquiries_manage');
  const inquiryId = text(formData, 'inquiryId');
  const expectedUpdatedAt = text(formData, 'expectedUpdatedAt');
  const path = isUuid(inquiryId) ? `/admin/inquiries/${inquiryId}` : '/admin/inquiries';
  if (!isUuid(inquiryId) || Number.isNaN(Date.parse(expectedUpdatedAt))) redirect(`${path}?error=validation`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('close_admin_support_inquiry', {
    p_inquiry_id: inquiryId, p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) redirect(`${path}?error=${errorKey(error.code, error.message)}`);
  if (parseInquiryMutationId(data) !== inquiryId) redirect(`${path}?error=save-failed`);
  revalidatePath('/admin/inquiries');
  revalidatePath(path);
  revalidatePath('/support/inquiries');
  revalidatePath(`/support/inquiries/${inquiryId}`);
  redirect(`${path}?result=closed`);
}
