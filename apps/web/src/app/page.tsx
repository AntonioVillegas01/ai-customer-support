import { LifeBuoy } from 'lucide-react';
import { t } from '@/lib/i18n';

export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-6 text-sidebar-foreground">
      <div className="w-full max-w-xl text-center">
        <span className="mx-auto mb-6 grid size-12 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><LifeBuoy className="size-6" aria-hidden /></span>
        <h1 className="text-4xl font-bold tracking-tight">AI Customer Support</h1>
        <p className="mt-3 text-sidebar-foreground/70">Grounded answers with verifiable citations, secure tool calling, and human handoff that keeps working when the AI does not.</p>
        <p className="mt-2 font-mono text-xs text-sidebar-foreground/50">multi-tenant · RAG · SSE · audit-ready</p>
        <div className="mt-8 flex justify-center gap-3">
          <a className="inline-flex h-9 items-center rounded-lg bg-sidebar-primary px-4 text-sm font-semibold text-sidebar-primary-foreground transition-colors hover:bg-sidebar-primary/85" href="/login">{t('auth.login')}</a>
          <a className="inline-flex h-9 items-center rounded-lg border border-sidebar-border px-4 text-sm font-semibold transition-colors hover:bg-sidebar-accent" href="/register">{t('auth.register')}</a>
        </div>
      </div>
    </main>
  );
}
