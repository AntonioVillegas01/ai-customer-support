'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: Readonly<{ className?: string }>) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = (): void => {
    const next = !(dark ?? false);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('acs-theme', next ? 'dark' : 'light');
    } catch {
      // localStorage unavailable (e.g. privacy mode); theme still toggles for this page.
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark === true ? t('app.themeLight') : t('app.themeDark')}
      title={dark === true ? t('app.themeLight') : t('app.themeDark')}
      className={cn('inline-flex size-8 items-center justify-center rounded-lg transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50', className)}
    >
      {dark === true ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
