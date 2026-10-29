import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { WebhookSummary } from '@toppo-tracker/shared';
import { Alert, EmptyState } from '@toppo-tracker/ui';
import { ChevronRightIcon, WebhookIcon } from 'lucide-react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { webhookState } from '../../utils/webhook-state.util.ts';
import { WebhookStateBadge } from '../webhook-state-badge.tsx';

/** The webhooks of the instance, each row opening its page. At most 20: the list comes whole. */
export function WebhooksList() {
  const { t } = useI18n();
  const webhooks = useQuery(WebhooksQueries.list);

  if (webhooks.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('webhooks.loading')}
      </p>
    );
  }
  if (webhooks.isError) {
    return <Alert tone="danger">{requestErrorMessage(webhooks.error, t)}</Alert>;
  }
  if (webhooks.data.length === 0) {
    return (
      <EmptyState
        icon={WebhookIcon}
        title={t('webhooks.emptyTitle')}
        description={t('webhooks.emptyDescription')}
      />
    );
  }
  return (
    <ul
      aria-label={t('webhooks.listLabel')}
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      {webhooks.data.map((webhook) => (
        <WebhookRow key={webhook.id} webhook={webhook} />
      ))}
    </ul>
  );
}

/** A webhook, the whole row opening it: its name is the link, stretched over the row. */
function WebhookRow({ webhook }: { webhook: WebhookSummary }) {
  const { t, locale } = useI18n();
  const events = webhook.events.length;

  return (
    <li className="relative flex items-center gap-3 px-4 py-3 transition-[background-color] hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <Link
          to="/settings/webhooks/$webhookId"
          params={{ webhookId: webhook.id }}
          className="block truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
        >
          {webhook.name}
        </Link>
        <p className="truncate font-mono text-xs text-muted-foreground">{webhook.url}</p>
        <p className="text-xs text-muted-foreground">
          {t(`webhooks.eventCount.${pluralForm(locale, events)}`, { count: events })}
        </p>
      </div>
      <WebhookStateBadge state={webhookState(webhook)} />
      <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </li>
  );
}
