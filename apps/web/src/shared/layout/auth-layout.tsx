import { Logo } from '@toppo-tracker/ui';
import { type ReactNode, useEffect } from 'react';
import { useI18n } from '../i18n/i18n-provider.tsx';

/** Frame of the pages shown before signing in: centered card, full width on phones. */
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    document.title = t('app.pageTitle', { page: title });
  }, [t, title]);

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:justify-center sm:py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo className="h-9" />
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {intro ? <p className="mt-1.5 text-sm text-muted-foreground">{intro}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
