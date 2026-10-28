import type { Locale } from '@toppo-tracker/shared';
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react';
import type { Translate } from './i18n.types.ts';
import { createTranslator } from './translate.util.ts';

interface I18nContextValue {
  locale: Locale;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const context = use(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return context;
}
