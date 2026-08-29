'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useOrgContext } from '@/components/app-shell';
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, TextInput } from '@/components/ui';
import { t } from '@/lib/i18n';
import { createApiKey, createApiKeyFormSchema, createWidget, fetchApiKeys, fetchAudit, revokeApiKey, widgetFormSchema, type ApiKeyCreatedResponse } from './settings-api';

export function SettingsPage() {
  const { role } = useOrgContext();
  const canManage = role === 'owner' || role === 'admin';
  return <div className="grid gap-4"><h1 className="text-2xl font-bold">{t('settings.title')}</h1><Card><h2 className="font-semibold">{t('settings.organization')}</h2><p className="text-sm text-slate-600">{t('settings.roleRestricted')}</p></Card><Card><h2 className="font-semibold">{t('settings.members')}</h2><p className="text-sm text-slate-600">{t('settings.roleRestricted')}</p></Card>{canManage ? <ApiKeysPanel /> : <Card><h2>{t('settings.apiKeys')}</h2><p>{t('settings.roleRestricted')}</p></Card>}{canManage ? <WidgetPanel /> : null}<AuditPanel /></div>;
}

function ApiKeysPanel() {
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<ApiKeyCreatedResponse | null>(null);
  const query = useQuery({ queryKey: ['api-keys', orgId], queryFn: () => fetchApiKeys(orgId) });
  const form = useForm<z.infer<typeof createApiKeyFormSchema>>({ resolver: zodResolver(createApiKeyFormSchema), defaultValues: { name: '', scopesText: 'widget:token' } });
  const createMutation = useMutation({ mutationFn: (values: z.infer<typeof createApiKeyFormSchema>) => createApiKey(orgId, { name: values.name, scopes: values.scopesText.split(',').map((scope) => scope.trim()).filter((scope) => scope.length > 0) as ['widget:token'] }), onSuccess: async (value) => { setCreated(value); form.reset(); await queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] }); } });
  return <Card><h2 className="font-semibold">{t('settings.apiKeys')}</h2><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}><Field label={t('settings.keyName')} error={form.formState.errors.name?.message}><TextInput {...form.register('name')} /></Field><Field label={t('settings.scopes')} error={form.formState.errors.scopesText?.message}><TextInput {...form.register('scopesText')} /></Field><Button type="submit" disabled={createMutation.isPending}>{t('settings.createKey')}</Button></form>{createMutation.isError ? <ErrorState message={createMutation.error.message} /> : null}{created === null ? null : <dialog open className="rounded-lg border border-slate-300 p-6 shadow"><h3 className="font-semibold">{t('settings.keyCreated')}</h3><code className="mt-3 block rounded bg-slate-100 p-3">{created.key}</code><Button className="mt-3" type="button" onClick={() => setCreated(null)}>{t('common.close')}</Button></dialog>}{query.isLoading ? <LoadingState message={t('common.loading')} /> : null}{query.isError ? <ErrorState message={query.error.message} /> : null}<ul className="mt-4 grid gap-2">{query.data?.map((key) => <li className="flex items-center justify-between rounded border border-slate-200 p-3" key={key.id}><span>{key.name} · {key.prefix}</span><Button type="button" variant="danger" disabled={key.revokedAt !== null} onClick={() => void revokeApiKey(orgId, key.id).then(() => queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] }))}>{t('common.delete')}</Button></li>)}</ul></Card>;
}

function WidgetPanel() {
  const { orgId } = useOrgContext();
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const form = useForm<z.infer<typeof widgetFormSchema>>({ resolver: zodResolver(widgetFormSchema), defaultValues: { title: 'Support', primaryColor: '#111827', locale: 'en', originsText: 'http://localhost:3000' } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof widgetFormSchema>) => createWidget(orgId, { title: values.title, primaryColor: values.primaryColor, locale: values.locale, origins: values.originsText.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0) }), onSuccess: (widget) => setCreatedKey(widget.publicKey) });
  return <Card><h2 className="font-semibold">{t('settings.widget')}</h2><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}><Field label={t('settings.widgetTitle')} error={form.formState.errors.title?.message}><TextInput {...form.register('title')} /></Field><Field label={t('settings.primaryColor')} error={form.formState.errors.primaryColor?.message}><TextInput {...form.register('primaryColor')} /></Field><Field label={t('settings.locale')} error={form.formState.errors.locale?.message}><TextInput {...form.register('locale')} /></Field><Field label={t('settings.origins')} error={form.formState.errors.originsText?.message}><TextInput {...form.register('originsText')} /></Field><Button type="submit" disabled={mutation.isPending}>{t('common.create')}</Button></form>{mutation.isError ? <ErrorState message={mutation.error.message} /> : null}{createdKey === null ? null : <div className="mt-4"><h3 className="font-semibold">{t('settings.embedSnippet')}</h3><code className="block overflow-x-auto rounded bg-slate-100 p-3 text-sm">{`<script src="https://cdn.example.invalid/acs-widget.js" data-widget-key="${createdKey}"></script>`}</code></div>}</Card>;
}

function AuditPanel() {
  const { orgId } = useOrgContext();
  const query = useQuery({ queryKey: ['audit', orgId], queryFn: () => fetchAudit(orgId) });
  return <Card><h2 className="font-semibold">{t('settings.audit')}</h2>{query.isLoading ? <LoadingState message={t('common.loading')} /> : null}{query.isError ? <ErrorState message={query.error.message} /> : null}{query.data?.length === 0 ? <EmptyState message={t('common.empty')} /> : null}<div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr><th>Action</th><th>Resource</th><th>Occurred</th></tr></thead><tbody>{query.data?.map((event) => <tr className="border-t border-slate-200" key={event.id}><td>{event.action}</td><td>{event.resourceType}:{event.resourceId}</td><td>{event.occurredAt}</td></tr>)}</tbody></table></div></Card>;
}
