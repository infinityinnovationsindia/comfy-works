import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname } = request.nextUrl;

  // Allow Vercel cron (server-to-server with secret) to bypass auth.
  // The CRON_SECRET env var is sent by Vercel as Authorization: Bearer <secret>.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && pathname.startsWith('/api/cron/') && authHeader === `Bearer ${cronSecret}`) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const isPublic = pathname === '/login' || pathname.startsWith('/api/auth');

  if (!session && !isPublic) return NextResponse.redirect(new URL('/login', request.url));
  if (session && pathname === '/login') return NextResponse.redirect(new URL('/attendance', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
