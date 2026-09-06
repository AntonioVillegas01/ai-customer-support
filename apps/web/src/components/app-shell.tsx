'use client';

import { BarChart3, BookOpen, Inbox, LifeBuoy, LogOut, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState } from 'react';
import { z } from 'zod';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiFetch } from '@/lib/api-client';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/schemas';

interface OrgContextValue { orgId: string; role: string; }
const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (ctx === null) throw new Error('OrgContext is required');
  return ctx;
}

const navItems = [
  { href: '/app/inbox', key: 'app.inbox', icon: Inbox },
  { href: '/app/knowledge', key: 'app.knowledge', icon: BookOpen },
  { href: '/app/analytics', key: 'app.analytics', icon: BarChart3 },
  { href: '/app/settings', key: 'app.settings', icon: Settings },
] as const;

function NavLinks({ pathname, className }: Readonly<{ pathname: string; className?: string }>) {
  return (
    <nav aria-label="Primary" className={cn('grid gap-1', className)}>
      {navItems.map(({ href, key, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
              active ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(key)}
          </a>
        );
      })}
    </nav>
  );
}

export function AppShell({ user, initialOrgId, children }: Readonly<{ user: AuthUser; initialOrgId: string; children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgId, setOrgId] = useState(initialOrgId);
  const active = user.memberships.find((item) => item.organizationId === orgId) ?? user.memberships[0];
  const value = useMemo(() => ({ orgId, role: active?.role ?? 'agent' }), [orgId, active?.role]);
  const logout = async (): Promise<void> => {
    await apiFetch('/v1/auth/logout', z.object({ ok: z.literal(true) }), { method: 'POST' });
    router.push('/login');
  };
  const orgSelect = (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/50 uppercase">{t('app.organization')}</span>
      <select
        aria-label={t('app.organization')}
        value={orgId}
        onChange={(event) => setOrgId(event.target.value)}
        className="h-8 w-full rounded-lg border border-sidebar-border bg-transparent px-2 font-mono text-xs text-sidebar-foreground outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
      >
        {user.memberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId} className="bg-sidebar text-sidebar-foreground">
            {membership.organizationId.slice(0, 8)} · {membership.role}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <OrgContext.Provider value={value}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
          <a href="/app/inbox" className="flex items-center gap-2.5 px-1 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><LifeBuoy className="size-4.5" aria-hidden /></span>
            <span className="text-sm leading-tight font-bold tracking-tight">ACS<span className="block text-[11px] font-normal text-sidebar-foreground/60">Support console</span></span>
          </a>
          {orgSelect}
          <NavLinks pathname={pathname} className="flex-1 content-start" />
          <div className="grid gap-3 border-t border-sidebar-border pt-4">
            <span className="truncate px-1 font-mono text-xs text-sidebar-foreground/60" title={user.email}>{user.email}</span>
            <div className="flex items-center justify-between gap-2">
              <ThemeToggle />
              <button type="button" onClick={() => void logout()} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
                <LogOut className="size-4" aria-hidden />
                {t('app.logout')}
              </button>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-3 border-b border-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
            <span className="grid size-7 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><LifeBuoy className="size-4" aria-hidden /></span>
            <nav aria-label="Primary" className="flex flex-1 flex-wrap gap-1 text-sm">
              {navItems.map(({ href, key }) => (
                <a key={href} href={href} aria-current={pathname.startsWith(href) ? 'page' : undefined} className={cn('rounded-lg px-2.5 py-1.5', pathname.startsWith(href) ? 'bg-sidebar-accent font-semibold' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60')}>
                  {t(key)}
                </a>
              ))}
            </nav>
            <ThemeToggle />
            <button type="button" onClick={() => void logout()} aria-label={t('app.logout')} className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-sidebar-accent"><LogOut className="size-4" aria-hidden /></button>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </OrgContext.Provider>
  );
}
