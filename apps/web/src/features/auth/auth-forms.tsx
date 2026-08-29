'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { loginRequestSchema, registerRequestSchema } from '@acs/contracts';
import { Button, Card, ErrorState, Field, TextInput } from '@/components/ui';
import { ApiError, apiFetch, jsonBody } from '@/lib/api-client';
import { t } from '@/lib/i18n';
import { loginResponseSchema } from '@/lib/schemas';
import { useAuthContext } from '@/providers/auth-provider';

export function LoginForm() {
  const router = useRouter();
  const auth = useAuthContext();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<z.infer<typeof loginRequestSchema>>({ resolver: zodResolver(loginRequestSchema), defaultValues: { email: '', password: '' } });
  return (
    <Card className="mx-auto mt-20 max-w-md">
      <h1 className="mb-6 text-2xl font-bold">{t('auth.loginTitle')}</h1>
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
        <a className="text-sm text-blue-700 underline" href="/register">{t('auth.needAccount')}</a>
      </form>
    </Card>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<z.infer<typeof registerRequestSchema>>({ resolver: zodResolver(registerRequestSchema), defaultValues: { email: '', password: '', name: '' } });
  return (
    <Card className="mx-auto mt-20 max-w-md">
      <h1 className="mb-6 text-2xl font-bold">{t('auth.registerTitle')}</h1>
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
        <a className="text-sm text-blue-700 underline" href="/login">{t('auth.haveAccount')}</a>
      </form>
    </Card>
  );
}
