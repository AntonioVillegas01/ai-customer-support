'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LifeBuoy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { loginRequestSchema, registerRequestSchema } from '@acs/contracts';
import { Button, ErrorState, Field, TextInput } from '@/components/ui';
import { ApiError, apiFetch, jsonBody } from '@/lib/api-client';
import { t } from '@/lib/i18n';
import { loginResponseSchema } from '@/lib/schemas';
import { useAuthContext } from '@/providers/auth-provider';

function AuthLayout({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_7fr]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><LifeBuoy className="size-5" aria-hidden /></span>
          <span className="text-sm font-bold tracking-tight">ACS · Support console</span>
        </div>
        <div className="grid gap-4">
          <p className="max-w-md text-3xl leading-snug font-semibold tracking-tight">Grounded AI answers, verifiable citations, and a human always one click away.</p>
          <p className="font-mono text-xs text-sidebar-foreground/60">multi-tenant · RAG · SSE · audit-ready</p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">AI Customer Support Platform</p>
      </aside>
      <main className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const auth = useAuthContext();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<z.infer<typeof loginRequestSchema>>({ resolver: zodResolver(loginRequestSchema), defaultValues: { email: '', password: '' } });
  return (
    <AuthLayout title={t('auth.loginTitle')}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          const result = await apiFetch('/v1/auth/login', loginResponseSchema, { method: 'POST', body: jsonBody(values) });
          auth.updateCsrfToken(result.csrfToken);
          router.push('/app');
        } catch (caught) {
          setError(caught instanceof ApiError ? caught : new ApiError({ code: 'UNKNOWN', message: t('auth.error'), status: 0 }));
        }
      })}>
        {error === null ? null : <ErrorState code={error.code} message={error.message} />}
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}><TextInput type="email" autoComplete="email" {...form.register('email')} /></Field>
        <Field label={t('auth.password')} error={form.formState.errors.password?.message}><TextInput type="password" autoComplete="current-password" {...form.register('password')} /></Field>
        <Button type="submit" disabled={form.formState.isSubmitting}>{t('auth.login')}</Button>
        <a className="text-sm text-primary underline underline-offset-4" href="/register">{t('auth.needAccount')}</a>
      </form>
    </AuthLayout>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<z.infer<typeof registerRequestSchema>>({ resolver: zodResolver(registerRequestSchema), defaultValues: { email: '', password: '', name: '' } });
  return (
    <AuthLayout title={t('auth.registerTitle')}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          await apiFetch('/v1/auth/register', z.object({ userId: z.string(), organizationId: z.string() }), { method: 'POST', body: jsonBody(values) });
          router.push('/login');
        } catch (caught) {
          setError(caught instanceof ApiError ? caught : new ApiError({ code: 'UNKNOWN', message: t('auth.error'), status: 0 }));
        }
      })}>
        {error === null ? null : <ErrorState code={error.code} message={error.message} />}
        <Field label={t('auth.name')} error={form.formState.errors.name?.message}><TextInput autoComplete="name" {...form.register('name')} /></Field>
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}><TextInput type="email" autoComplete="email" {...form.register('email')} /></Field>
        <Field label={t('auth.password')} error={form.formState.errors.password?.message}><TextInput type="password" autoComplete="new-password" {...form.register('password')} /></Field>
        <Button type="submit" disabled={form.formState.isSubmitting}>{t('auth.register')}</Button>
        <a className="text-sm text-primary underline underline-offset-4" href="/login">{t('auth.haveAccount')}</a>
      </form>
    </AuthLayout>
  );
}
