'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button, Select } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { t } from '@/lib/i18n';
import type { AuthUser } from '@/lib/schemas';

interface OrgContextValue { orgId: string; role: string; }
const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (ctx === null) throw new Error('OrgContext is required');
  return ctx;
}

export function AppShell({ user, initialOrgId, children }: Readonly<{ user: AuthUser; initialOrgId: string; children: React.ReactNode }>) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(initialOrgId);
  const active = user.memberships.find((item) => item.organizationId === orgId) ?? user.memberships[0];
  const value = useMemo(() => ({ orgId, role: active?.role ?? 'agent' }), [orgId, active?.role]);
  return (
    <OrgContext.Provider value={value}>
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <strong>{t('app.organization')}</strong>
              <Select aria-label={t('app.organization')} value={orgId} onChange={(event) => setOrgId(event.target.value)}>
                {user.memberships.map((membership) => <option key={membership.organizationId} value={membership.organizationId}>{membership.organizationId.slice(0, 8)} · {membership.role}</option>)}
              </Select>
            </div>
            <nav aria-label="Primary" className="flex gap-3 text-sm">
              <a href="/app/inbox" className="rounded px-2 py-1 hover:bg-slate-100">{t('app.inbox')}</a>
              <a href="/app/knowledge" className="rounded px-2 py-1 hover:bg-slate-100">{t('app.knowledge')}</a>
              <a href="/app/analytics" className="rounded px-2 py-1 hover:bg-slate-100">{t('app.analytics')}</a>
              <a href="/app/settings" className="rounded px-2 py-1 hover:bg-slate-100">{t('app.settings')}</a>
            </nav>
            <div className="flex items-center gap-3 text-sm"><span>{user.email}</span><Button variant="secondary" onClick={async () => { await apiFetch('/v1/auth/logout', z.object({ ok: z.literal(true) }), { method: 'POST' }); router.push('/login'); }}>{t('app.logout')}</Button></div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </div>
    </OrgContext.Provider>
  );
}
