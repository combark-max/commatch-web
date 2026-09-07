import { NextRequest, NextResponse } from 'next/server';
import { parseProfileImageRequestPath } from '@/lib/profile-image';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createProfileImageServerSupabaseClient } from '@/lib/supabase/profile-image-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 60;

const errorResponse = (status: number, message: string) => NextResponse.json(
  { error: message },
  { status, headers: { 'Cache-Control': 'private, no-store' } },
);

export async function GET(request: NextRequest) {
  const objectPath = parseProfileImageRequestPath(request.nextUrl.searchParams.get('path'));
  if (!objectPath) return errorResponse(400, 'Invalid profile image path');

  const { supabase, applyAuthResponseHeaders } = await createProfileImageServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return errorResponse(401, 'Authentication required');

  const { data: accessAllowed, error: accessError } = await supabase.rpc(
    'can_access_profile_image',
    { p_object_path: objectPath },
  );
  if (accessError) return errorResponse(500, 'Unable to verify profile image access');
  if (accessAllowed !== true) return errorResponse(403, 'Profile image access denied');

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from('profile_images')
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return errorResponse(404, 'Profile image not found');

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set('Cache-Control', 'private, max-age=45');
  applyAuthResponseHeaders(response.headers);
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
