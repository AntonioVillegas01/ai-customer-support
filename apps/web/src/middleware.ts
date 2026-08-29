import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/env';

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/app')) return NextResponse.next();
  const response = await fetch(`${API_URL}/v1/auth/me`, { headers: { cookie: request.headers.get('cookie') ?? '' }, cache: 'no-store' });
  if (response.ok) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/app/:path*'] };
