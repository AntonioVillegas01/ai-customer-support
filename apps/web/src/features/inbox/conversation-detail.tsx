'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import type { ConversationStatus, Message } from '@acs/contracts';
import { useOrgContext } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingState, TextArea } from '@/components/ui';
import { toDateTime } from '@/lib/format';
import { formatStatus, t } from '@/lib/i18n';
import { Sparkles } from 'lucide-react';
import { allowedStatusTransitions } from '@/lib/status';
import { subscribeConversationEvents } from '@/lib/sse-client';
import { addInternalNote, fetchConversationDetail, noteSchema, replySchema, sendAgentMessage, updateConversationStatus } from './inbox-api';

export function ConversationDetail({ conversationId }: Readonly<{ conversationId: string }>) {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const detailKey = useMemo(() => ['conversation', orgId, conversationId], [orgId, conversationId]);
  const query = useQuery({ queryKey: detailKey, queryFn: () => fetchConversationDetail(orgId, conversationId) });
  useEffect(() => {
    const controller = new AbortController();
    void subscribeConversationEvents({ orgId, conversationId, signal: controller.signal, onEvent: (event) => {
      setLiveMessage(event.type);
      if (event.type === 'message.created' || event.type === 'message.completed' || event.type === 'conversation.updated') void queryClient.invalidateQueries({ queryKey: detailKey });
    }, onError: (message) => setLiveMessage(message) }).catch((error: unknown) => setLiveMessage(error instanceof Error ? error.message : 'SSE error'));
    return () => controller.abort();
  }, [orgId, conversationId, queryClient, detailKey]);
  if (query.isLoading) return <LoadingState message={t('common.loading')} />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const detail = query.data;
  if (detail === undefined) return <EmptyState message={t('common.empty')} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid gap-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-2xl font-bold tracking-tight">{detail.conversation.subject ?? detail.conversation.id}</h1>{detail.conversation.escalationReasonCode === null ? null : <p className="mt-2 text-sm text-destructive">{t('detail.escalationReason')}: {detail.conversation.escalationReasonCode}</p>}</div>
            <div className="flex gap-2"><Badge value={detail.conversation.status} /><Badge value={detail.conversation.priority} /></div>
          </div>
          <StatusControls status={detail.conversation.status} conversationId={conversationId} />
        </Card>
        <Card><h2 className="mb-3 font-semibold">{t('detail.messagesLive')}</h2><div aria-live="polite" className="sr-only">{liveMessage}</div><MessageThread messages={detail.messages.items} /></Card>
        <Composer conversationId={conversationId} />
      </section>
      <aside className="grid content-start gap-4">
        <Card><h2 className="font-semibold">{t('detail.note')}</h2><NoteForm conversationId={conversationId} /><div className="mt-4 grid gap-3">{detail.notes.map((note) => <article className="rounded-lg border border-border p-3 text-sm" key={note.id}><p>{note.content}</p><time className="font-mono text-xs text-muted-foreground">{toDateTime(note.createdAt)}</time></article>)}</div></Card>
        <Card><h2 className="font-semibold">{t('detail.aiLabel')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('detail.suggestionUnavailable')}</p><p className="mt-2 text-sm text-muted-foreground">{t('detail.summaryUnavailable')}</p></Card>
      </aside>
    </div>
  );
}

function MessageThread({ messages }: Readonly<{ messages: Message[] }>) {
  if (messages.length === 0) return <EmptyState message={t('common.empty')} />;
  return <ol className="grid gap-3">{messages.map((message) => <li key={message.id} className={message.aiGenerated ? 'rounded-lg border border-ai/30 bg-ai/5 p-3' : 'rounded-lg border border-border p-3'}><div className="flex items-center justify-between gap-2"><strong className="flex items-center gap-2 capitalize">{message.role}{message.aiGenerated ? <span className="inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5 text-[11px] font-semibold text-ai normal-case"><Sparkles className="size-3" aria-hidden />{t('detail.aiLabel')}</span> : null}</strong><time className="font-mono text-xs text-muted-foreground">{toDateTime(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{message.content}</p>{message.citations.length === 0 ? null : <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-ai">{t('detail.citations')} ({message.citations.length})</summary><ul className="mt-2 grid gap-2">{message.citations.map((citation) => <li className="rounded-md border-l-2 border-ai/50 bg-muted p-2 text-xs" key={citation.chunkId}><span className="font-semibold">{citation.title}</span> · <span className="font-mono">{citation.score.toFixed(2)}</span><p className="mt-1 text-muted-foreground">{citation.snippet}</p></li>)}</ul></details>}</li>)}</ol>;
}

function Composer({ conversationId }: Readonly<{ conversationId: string }>) {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof replySchema>>({ resolver: zodResolver(replySchema), defaultValues: { content: '' } });
  const mutation = useMutation({ mutationFn: (content: string) => sendAgentMessage(orgId, conversationId, content), onSuccess: async () => { form.reset(); await queryClient.invalidateQueries({ queryKey: ['conversation', orgId, conversationId] }); } });
  return <Card><form className="grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values.content))}><Field label={t('detail.reply')} error={form.formState.errors.content?.message}><TextArea rows={5} {...form.register('content')} /></Field>{mutation.isError ? <ErrorState message={mutation.error.message} /> : null}<Button type="submit" disabled={mutation.isPending}>{t('common.send')}</Button></form></Card>;
}

function NoteForm({ conversationId }: Readonly<{ conversationId: string }>) {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof noteSchema>>({ resolver: zodResolver(noteSchema), defaultValues: { content: '' } });
  const mutation = useMutation({ mutationFn: (content: string) => addInternalNote(orgId, conversationId, content), onSuccess: async () => { form.reset(); await queryClient.invalidateQueries({ queryKey: ['conversation', orgId, conversationId] }); } });
  return <form className="mt-3 grid gap-2" onSubmit={form.handleSubmit((values) => mutation.mutate(values.content))}><Field label={t('detail.addNote')} error={form.formState.errors.content?.message}><TextArea rows={3} {...form.register('content')} /></Field><Button type="submit" variant="secondary" disabled={mutation.isPending}>{t('detail.addNote')}</Button></form>;
}

function StatusControls({ status, conversationId }: Readonly<{ status: ConversationStatus; conversationId: string }>) {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: (next: ConversationStatus) => updateConversationStatus(orgId, conversationId, next), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['conversation', orgId, conversationId] }); } });
  return <div className="mt-4"><h2 className="mb-2 text-sm font-semibold">{t('detail.transitions')}</h2><div className="flex flex-wrap gap-2">{allowedStatusTransitions(status).map((next) => <Button key={next} type="button" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate(next)}>{formatStatus(next)}</Button>)}</div>{mutation.isError ? <ErrorState message={mutation.error.message} /> : null}</div>;
}
