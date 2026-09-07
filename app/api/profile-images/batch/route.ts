import { NextRequest, NextResponse } from 'next/server';
import {
  handleProfileImageBatch,
} from '@/lib/profile-image-batch';
import { parseProfileImageRequestPath } from '@/lib/profile-image';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createProfileImageServerSupabaseClient } from '@/lib/supabase/profile-image-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatDuration = (duration: number) => duration.toFixed(1);

export async function POST(request: NextRequest) {
  const routeStartedAt = performance.now();
  let authDuration = 0;
  let accessStartedAt: number | null = null;
  let accessFinishedAt: number | null = null;
  let signDuration = 0;

  const { supabase, applyAuthResponseHeaders } = await createProfileImageServerSupabaseClient();
  const input = await request.json().catch(() => null);

  const result = await handleProfileImageBatch(input, {
    authenticate: async () => {
      const authStartedAt = performance.now();
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        return !error && Boolean(user);
      } finally {
        authDuration = performance.now() - authStartedAt;
      }
    },
    parsePath: parseProfileImageRequestPath,
    canAccess: async (path) => {
      accessStartedAt ??= performance.now();
      try {
        const { data, error } = await supabase.rpc(
          'can_access_profile_image',
          { p_object_path: path },
        );
        return !error && data === true;
      } finally {
        accessFinishedAt = performance.now();
      }
    },
    createSignedUrls: async (paths, expiresIn) => {
      const admin = createSupabaseAdminClient();
      const signStartedAt = performance.now();
      try {
        const { data, error } = await admin.storage
          .from('profile_images')
          .createSignedUrls(paths, expiresIn);
        if (error || !data) throw error ?? new Error('Profile image signing failed');
        return data;
      } finally {
        signDuration = performance.now() - signStartedAt;
      }
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
  const accessDuration = accessStartedAt === null || accessFinishedAt === null
    ? 0
    : accessFinishedAt - accessStartedAt;
  const totalDuration = performance.now() - routeStartedAt;
  const serverTiming = [
    `auth;dur=${formatDuration(authDuration)}`,
    `access;dur=${formatDuration(accessDuration)}`,
    `sign;dur=${formatDuration(signDuration)}`,
    `total;dur=${formatDuration(totalDuration)}`,
  ].join(', ');
  response.headers.set('Server-Timing', serverTiming);
  return response;
}
