import { PuzzleIcon } from 'lucide-react';
import { useI18n } from '../../../../../shared/i18n/i18n-provider.tsx';

/** Who asks, in what Toppo draws for a plugin: never Toppo itself, whatever the plugin says. */
export function AskedBy({ plugin }: { plugin: { en: string; fr: string } }) {
  const { t, locale } = useI18n();
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <PuzzleIcon aria-hidden="true" className="size-3.5" />
      {t('plugins.overlays.askedBy', { plugin: plugin[locale] })}
    </p>
  );
}
