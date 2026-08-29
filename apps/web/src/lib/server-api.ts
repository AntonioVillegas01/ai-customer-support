import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL } from '@/lib/env';
import { meResponseSchema, type AuthUser } from '@/lib/schemas';

export async function getServerUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const response = await fetch(`${API_URL}/v1/auth/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const parsed = meResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.user : null;
}

export async function requireServerUser(): Promise<AuthUser> {
  const user = await getServerUser();
  if (user === null) redirect('/login');
  return user;
}
