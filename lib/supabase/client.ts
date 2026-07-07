import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client for use in the browser.
 * Note: This requires the @supabase/supabase-js package to be installed.
 */
export const createClient = (): SupabaseClient => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
};
