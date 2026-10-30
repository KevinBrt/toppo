import type { WebhookSummary } from '@toppo-tracker/shared';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { webhookState } from '../../utils/webhook-state.util.ts';
import { WebhookStateBadge } from '../webhook-state-badge.tsx';

/** The page's heading: the webhook's name and state, where it is sent, and since when. */
export function WebhookHeader({ webhook }: { webhook: WebhookSummary }) {
  const { t, locale } = useI18n();

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
          {webhook.name}
        </h1>
        <WebhookStateBadge state={webhookState(webhook)} />
      </div>
      <p className="font-mono text-sm break-all text-foreground">{webhook.url}</p>
      <p className="text-sm text-muted-foreground">
        {t('webhooks.addedOn', { date: formatDateTime(webhook.createdAt, locale) })}
      </p>
    </header>
  );
}
