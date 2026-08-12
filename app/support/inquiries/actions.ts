'use server';

import { redirect } from 'next/navigation';
import { isSupportInquiryCategory, parseInquiryMutationId } from '@/lib/support/inquiries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function createMySupportInquiryAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const subjectValue = formData.get('subject');
  const bodyValue = formData.get('body');
  const subject = typeof subjectValue === 'string' ? subjectValue.trim() : '';
  const body = typeof bodyValue === 'string' ? bodyValue.trim() : '';

  if (!isSupportInquiryCategory(category) || subject.length < 1 || subject.length > 150
    || body.length < 1 || body.length > 5000) {
    redirect('/support/inquiries/new?error=validation');
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data, error } = await supabase.rpc('create_my_support_inquiry', {
    p_category: category,
    p_subject: subject,
    p_body: body,
  });
  if (error) redirect(`/support/inquiries/new?error=${error.code === '22023' ? 'validation' : 'save-failed'}`);

  const inquiryId = parseInquiryMutationId(data);
  if (!inquiryId) redirect('/support/inquiries/new?error=save-failed');
  redirect(`/support/inquiries/${inquiryId}?result=created`);
}
