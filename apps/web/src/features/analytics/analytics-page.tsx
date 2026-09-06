'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrgContext } from '@/components/app-shell';
import { Card, ErrorState, LoadingState } from '@/components/ui';
import { t } from '@/lib/i18n';
import { fetchUsage } from '@/features/settings/settings-api';

export function AnalyticsPage() {
  const { orgId } = useOrgContext();
  const query = useQuery({ queryKey: ['usage', orgId], queryFn: () => fetchUsage(orgId), retry: false });
  return <div className="grid gap-4"><h1 className="text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>{query.isLoading ? <LoadingState message={t('common.loading')} /> : null}{query.isError ? <ErrorState message={t('analytics.unavailable')} /> : null}{query.data === undefined ? null : <div className="grid gap-4 md:grid-cols-4"><Metric label="Conversations" value={query.data.conversations ?? 0} /><Metric label="AI runs" value={query.data.aiRuns ?? 0} /><Metric label="Tokens" value={query.data.tokens ?? 0} /><Metric label="Cost" value={query.data.aiCostUsd ?? '0'} /></div>}</div>;
}
function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) { return <Card><p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p><strong className="mt-1 block font-mono text-2xl tracking-tight">{value}</strong></Card>; }
