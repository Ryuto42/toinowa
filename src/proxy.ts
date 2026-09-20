import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { clientEnv } from '@/lib/shared/env.client';
import type { Database } from '@/lib/database/types';
import { roleFromClaims } from '@/lib/auth/claims';

const protectedPrefixes = ['/student', '/teacher', '/admin'];

function requiredRole(pathname: string): 'student' | 'teacher' | 'admin' | null {
  if (pathname.startsWith('/student')) return 'student';
  if (pathname.startsWith('/teacher')) return 'teacher';
  if (pathname.startsWith('/admin')) return 'admin';
  return null;
}

function isProtected(pathname: string): boolean {
  return (
    protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith('/api/protected/')
  );
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session and verify the JWT before applying the optimistic gate.
  const { data } = await supabase.auth.getClaims();
  const role = roleFromClaims(data?.claims?.app_role);
  const pathname = request.nextUrl.pathname;
  if (data?.claims?.must_change_password === true && (isProtected(pathname) || pathname === '/login')) {
    return NextResponse.redirect(new URL('/change-password', request.url));
  }
  if (!isProtected(pathname)) return response;

  if (role === 'none') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  const needed = requiredRole(pathname);
  const roleAllowed =
    needed === null ||
    role === 'admin' ||
    role === needed ||
    (needed === 'teacher' && role === 'teacher');
  if (!roleAllowed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)'],
};
