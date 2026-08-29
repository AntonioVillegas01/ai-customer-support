import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireServerUser } from '@/lib/server-api';

export default async function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireServerUser();
  const membership = user.memberships[0];
  if (membership === undefined) redirect('/login');
  return <AppShell user={user} initialOrgId={membership.organizationId}>{children}</AppShell>;
}
