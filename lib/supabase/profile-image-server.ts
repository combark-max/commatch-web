import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createProfileImageAuthResponse } from '@/lib/profile-image-auth-response';

export async function createProfileImageServerSupabaseClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authResponse = createProfileImageAuthResponse(cookieStore);
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: authResponse.cookies,
  });

  return {
    supabase,
    applyAuthResponseHeaders: authResponse.applyTo,
  };
}
