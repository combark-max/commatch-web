import { NextRequest, NextResponse } from 'next/server';
import {
  handleProfileImageBatch,
} from '@/lib/profile-image-batch';
import { parseProfileImageRequestPath } from '@/lib/profile-image';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createProfileImageServerSupabaseClient } from '@/lib/supabase/profile-image-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { supabase, applyAuthResponseHeaders } = await createProfileImageServerSupabaseClient();
  const input = await request.json().catch(() => null);

  const result = await handleProfileImageBatch(input, {
    authenticate: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && Boolean(user);
    },
    parsePath: parseProfileImageRequestPath,
    canAccess: async (path) => {
      const { data, error } = await supabase.rpc(
        'can_access_profile_image',
        { p_object_path: path },
      );
      return !error && data === true;
    },
    createSignedUrls: async (paths, expiresIn) => {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage
        .from('profile_images')
        .createSignedUrls(paths, expiresIn);
      if (error || !data) throw error ?? new Error('Profile image signing failed');
      return data;
    },
  });

  const response = NextResponse.json(result.body, {
    status: result.status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
  applyAuthResponseHeaders(response.headers);
  return response;
}
