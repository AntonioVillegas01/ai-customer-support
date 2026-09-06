'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useOrgContext } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingState, TextArea, TextInput } from '@/components/ui';
import { t } from '@/lib/i18n';
import { createFaq, createFileSource, createUrlSource, deleteSource, faqFormSchema, fetchKnowledgeSources, reprocessSource, searchKnowledge, urlFormSchema } from './knowledge-api';

export function KnowledgePage() {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['knowledge-sources', orgId], queryFn: () => fetchKnowledgeSources(orgId) });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['knowledge-sources', orgId] }); };
  return <div className="grid gap-4"><h1 className="text-2xl font-bold tracking-tight">{t('knowledge.title')}</h1><div className="grid gap-4 lg:grid-cols-3"><FaqForm onChanged={refresh} /><UrlForm onChanged={refresh} /><FileForm onChanged={refresh} /></div><SearchBox /><Card>{query.isLoading ? <LoadingState message={t('common.loading')} /> : null}{query.isError ? <ErrorState message={query.error.message} /> : null}{query.data?.length === 0 ? <EmptyState message={t('common.empty')} /> : null}<ul className="grid gap-3">{query.data?.map((source) => <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"><div><strong>{source.name}</strong><div className="mt-1 flex gap-2"><Badge value={source.type} /><Badge value={source.latestIngestionStatus ?? 'pending'} /></div></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => void reprocessSource(orgId, source.id).then(refresh)}>{t('common.reprocess')}</Button><Button type="button" variant="danger" onClick={() => void deleteSource(orgId, source.id).then(refresh)}>{t('common.delete')}</Button></div></li>)}</ul></Card></div>;
}

function parseTags(tagsText: string | undefined): string[] {
  return tagsText?.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0) ?? [];
}

function FaqForm({ onChanged }: Readonly<{ onChanged: () => Promise<void> }>) {
  const { orgId } = useOrgContext();
  const form = useForm<z.infer<typeof faqFormSchema>>({ resolver: zodResolver(faqFormSchema), defaultValues: { question: '', answer: '', tagsText: '' } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof faqFormSchema>) => createFaq(orgId, { question: values.question, answer: values.answer, tags: parseTags(values.tagsText) }), onSuccess: async () => { form.reset(); await onChanged(); } });
  return <Card><h2 className="font-semibold">{t('knowledge.faq')}</h2><form className="mt-3 grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}><Field label={t('knowledge.question')} error={form.formState.errors.question?.message}><TextInput {...form.register('question')} /></Field><Field label={t('knowledge.answer')} error={form.formState.errors.answer?.message}><TextArea rows={4} {...form.register('answer')} /></Field><Field label={t('knowledge.tags')}><TextInput {...form.register('tagsText')} /></Field>{mutation.isError ? <ErrorState message={mutation.error.message} /> : null}<Button type="submit" disabled={mutation.isPending}>{t('common.create')}</Button></form></Card>;
}

function UrlForm({ onChanged }: Readonly<{ onChanged: () => Promise<void> }>) {
  const { orgId } = useOrgContext();
  const form = useForm<z.infer<typeof urlFormSchema>>({ resolver: zodResolver(urlFormSchema), defaultValues: { url: '', tagsText: '' } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof urlFormSchema>) => createUrlSource(orgId, { url: values.url, tags: parseTags(values.tagsText) }), onSuccess: async () => { form.reset(); await onChanged(); } });
  return <Card><h2 className="font-semibold">{t('knowledge.url')}</h2><form className="mt-3 grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}><Field label={t('knowledge.sourceUrl')} error={form.formState.errors.url?.message}><TextInput type="url" {...form.register('url')} /></Field><Field label={t('knowledge.tags')}><TextInput {...form.register('tagsText')} /></Field>{mutation.isError ? <ErrorState message={mutation.error.message} /> : null}<Button type="submit" disabled={mutation.isPending}>{t('common.create')}</Button></form></Card>;
}

function FileForm({ onChanged }: Readonly<{ onChanged: () => Promise<void> }>) {
  const { orgId } = useOrgContext();
  const [error, setError] = useState<string | null>(null);
  return <Card><h2 className="font-semibold">{t('knowledge.file')}</h2><form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); setError(null); const form = new FormData(event.currentTarget); void createFileSource(orgId, form).then(onChanged).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('common.error'))); }}><Field label={t('knowledge.upload')}><TextInput name="file" type="file" accept=".pdf,.txt,.md,.html" /></Field><Field label={t('knowledge.tags')}><TextInput name="tags" /></Field>{error === null ? null : <ErrorState message={error} />}<Button type="submit">{t('common.create')}</Button></form></Card>;
}

function SearchBox() {
  const { orgId } = useOrgContext();
  const [term, setTerm] = useState('');
  const query = useQuery({ queryKey: ['knowledge-search', orgId, term], queryFn: () => searchKnowledge(orgId, term), enabled: term.length > 1 });
  return <Card><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setTerm(String(data.get('q') ?? '')); }}><Field label={t('knowledge.searchPlaceholder')}><TextInput name="q" /></Field><Button type="submit">{t('common.search')}</Button></form>{query.isError ? <ErrorState message={query.error.message} /> : null}<ul className="mt-3 grid gap-2">{query.data?.map((item, index) => <li key={`${item.title}-${index}`} className="rounded-lg border border-border p-3 text-sm"><strong>{item.title}</strong><span className="ml-2 font-mono text-xs text-muted-foreground">{item.score.toFixed(2)}</span><p>{item.snippet ?? item.content ?? ''}</p></li>)}</ul></Card>;
}
