'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { formatStatus, t } from '@/lib/i18n';
import { useOrgContext } from '@/components/app-shell';
import { fetchConversations, filterStatuses, type InboxFilter } from './inbox-api';

export function ConversationList() {
  const { orgId } = useOrgContext();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const query = useInfiniteQuery({
    queryKey: ['conversations', orgId, filter],
    queryFn: ({ pageParam }) => fetchConversations(orgId, pageParam, filter),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const conversations = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('inbox.title')}</h1>
        <div role="tablist" aria-label={t('inbox.status')} className="flex flex-wrap gap-2">
          {filterStatuses.map((item) => <Button key={item} type="button" variant={filter === item ? 'primary' : 'secondary'} onClick={() => setFilter(item)}>{item === 'all' ? t('inbox.all') : item === 'unassigned' ? t('inbox.unassigned') : formatStatus(item)}</Button>)}
        </div>
      </header>
      {query.isLoading ? <LoadingState message={t('common.loading')} /> : null}
      {query.isError ? <ErrorState message={query.error.message} /> : null}
      {!query.isLoading && conversations.length === 0 ? <EmptyState message={t('common.empty')} /> : null}
      <div className="grid gap-3">
        {conversations.map((conversation) => (
          <Link key={conversation.id} href={`/app/inbox/${conversation.id}`} className="block">
            <Card className="hover:border-blue-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{conversation.subject ?? conversation.id}</h2>
                  <p className="text-sm text-slate-600">{t('inbox.updated')}: {relativeTime(conversation.lastMessageAt ?? conversation.createdAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">{conversation.tags.map((tag) => <span className="rounded bg-slate-100 px-2 py-1 text-xs" key={tag}>{tag}</span>)}</div>
                </div>
                <div className="flex flex-wrap gap-2"><Badge value={conversation.status} tone={conversation.status === 'escalated' ? 'danger' : 'neutral'} /><Badge value={conversation.priority} tone={conversation.priority === 'urgent' ? 'danger' : conversation.priority === 'high' ? 'warn' : 'neutral'} />{conversation.urgency === null ? null : <Badge value={conversation.urgency} tone="warn" />}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {query.hasNextPage ? <Button type="button" variant="secondary" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>{t('common.loadMore')}</Button> : null}
    </div>
  );
}
