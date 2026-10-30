import type { Locale, PluginDetailsResponse } from '@toppo-tracker/shared';
import { formatFullDateTime } from '../../../../shared/i18n/dates.util.ts';
import type { Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { shownStateOf } from '../../utils/plugin-state.util.ts';
import { PluginLogo } from '../plugin-logo.tsx';
import { PluginStateBadge } from '../plugin-state-badge.tsx';

/**
 * The page's heading: the plugin's logo, name, version and state, what it does, then what tells
 * this zip apart, its fingerprint, and who approved it.
 */
export function PluginHeader({ plugin }: { plugin: PluginDetailsResponse }) {
  const { t, locale } = useI18n();
  const description = plugin.description[locale];

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <PluginLogo url={plugin.logoUrl} className="size-12 sm:size-14" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
            {plugin.name[locale]}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">
              {t('plugins.version', { version: plugin.version })}
            </span>
            <PluginStateBadge state={shownStateOf(plugin)} />
          </div>
        </div>
      </div>
      {description ? <p className="text-sm text-foreground">{description}</p> : null}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-medium text-foreground">{t('plugins.fingerprint')}</dt>
        <dd className="min-w-0">
          <code className="font-mono text-xs break-all text-foreground">
            {plugin.packageSha256}
          </code>
          <p className="mt-1 text-xs text-muted-foreground">{t('plugins.fingerprintHelp')}</p>
        </dd>
        <dt className="font-medium text-foreground">{t('plugins.approval')}</dt>
        <dd className="text-muted-foreground">{approvalText(plugin.approval, t, locale)}</dd>
      </dl>
    </header>
  );
}

/** "Approved by Ada Lovelace on Oct 20, 2026, 9:14 AM.", or that it waits for an approval. */
function approvalText(
  approval: PluginDetailsResponse['approval'],
  t: Translate,
  locale: Locale,
): string {
  if (approval === null) {
    return t('plugins.notApproved');
  }
  const date = formatFullDateTime(approval.at, locale);
  // Whoever approved it may have been deleted since.
  return approval.by?.name
    ? t('plugins.approvedBy', { name: approval.by.name, date })
    : t('plugins.approvedOn', { date });
}
