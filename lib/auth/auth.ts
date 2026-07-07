import { createClient } from '@/lib/supabase/client';
import { AuthResponse, UserResponse, AuthError } from '@supabase/supabase-js';

const supabase = createClient();

/**
 * Signs up a new user with email and password.
 */
export const signUp = async (email: string, password: string): Promise<AuthResponse> => {
  return await supabase.auth.signUp({
    email,
    password,
  });
};

/**
 * Signs in an existing user with email and password.
 */
export const signIn = async (email: string, password: string): Promise<AuthResponse> => {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
};

/**
 * Signs out the current user.
 */
export const signOut = async (): Promise<{ error: AuthError | null }> => {
  return await supabase.auth.signOut();
};

/**
 * Retrieves the currently authenticated user.
 */
export const getCurrentUser = async (): Promise<UserResponse> => {
  return await supabase.auth.getUser();
};
