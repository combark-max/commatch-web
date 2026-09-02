import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');

  let response = NextResponse.next({ request });
  const responseCookies: Parameters<typeof response.cookies.set>[] = [];
  const responseHeaders = new Headers();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          responseCookies.push([name, value, options]);
        });
        Object.entries(headers).forEach(([name, value]) => {
          responseHeaders.set(name, value);
        });

        response = NextResponse.next({ request });
        responseCookies.forEach((cookie) => {
          response.cookies.set(...cookie);
        });
        responseHeaders.forEach((value, name) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)',
  ],
};
