import { Card } from '@/components/ui';
import { t } from '@/lib/i18n';

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-6">
      <Card>
        <h1 className="text-2xl font-bold">AI Customer Support</h1>
        <p className="mt-2 text-slate-600">Staff dashboard for authenticated support teams.</p>
        <div className="mt-4 flex gap-3"><a className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white" href="/login">{t('auth.login')}</a><a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold" href="/register">{t('auth.register')}</a></div>
      </Card>
    </main>
  );
}
