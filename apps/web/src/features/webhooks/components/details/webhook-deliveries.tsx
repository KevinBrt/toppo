import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  WEBHOOK_DELIVERIES_KEPT,
  type WebhookDelivery,
  type WebhookDetailsResponse,
} from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import type { Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { deliveryProblem } from '../../utils/webhook-state.util.ts';
import { WebhookSection } from '../webhook-section.tsx';

const CELL = 'px-3 py-2 align-top';

/** How a delivery went: sent, waiting, tried again, or given up, and why. */
function outcome(delivery: WebhookDelivery, t: Translate): string {
  if (delivery.status === 'delivered') {
    return t('webhooks.delivered', { status: delivery.responseStatus ?? 200 });
  }
  if (delivery.status === 'pending' && delivery.attempts === 0) {
    return t('webhooks.waiting');
  }
  const why = deliveryProblem({ status: delivery.responseStatus, error: delivery.error }, t);
  return delivery.status === 'failed'
    ? t('webhooks.givenUp', { why })
    : t('webhooks.retrying', { why, attempts: delivery.attempts });
}

/** Delivered, waiting for its first try, or gone wrong. */
function outcomeColor({ status, attempts }: WebhookDelivery): string {
  if (status === 'delivered') {
    return 'text-foreground';
  }
  return attempts > 0 ? 'text-danger' : 'text-muted-foreground';
}

/**
 * A webhook's latest deliveries, the latest first: what each told, how it went, and each one to
 * send again, as it was. Never what it carried.
 */
export function WebhookDeliveries({ webhook }: { webhook: WebhookDetailsResponse }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const redeliver = useMutation({
    mutationFn: (deliveryId: string) => Webhooks.redeliver(webhook.id, deliveryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });

  return (
    <WebhookSection
      title={t('webhooks.deliveriesTitle')}
      description={t('webhooks.deliveriesHelp', { count: WEBHOOK_DELIVERIES_KEPT })}
    >
      {redeliver.isError ? (
        <Alert tone="danger">{requestErrorMessage(redeliver.error, t, WEBHOOK_ERRORS)}</Alert>
      ) : null}
      {webhook.deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('webhooks.deliveriesNone')}</p>
      ) : (
        // Positioned, so that the hidden labels of its buttons scroll with it, not the page.
        <div className="relative overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('webhooks.deliveriesTitle')}</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('webhooks.deliveryColumns.when')}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('webhooks.deliveryColumns.event')}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('webhooks.deliveryColumns.result')}
                </th>
                <th scope="col" className={`${CELL} text-right font-medium`}>
                  {t('webhooks.deliveryColumns.duration')}
                </th>
                <th scope="col" className={CELL}>
                  <span className="sr-only">{t('webhooks.deliveryColumns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {webhook.deliveries.map((delivery) => {
                const when = formatDateTime(delivery.createdAt, locale);
                return (
                  <tr key={delivery.id}>
                    <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>{when}</td>
                    <td className={`${CELL} font-mono text-xs text-foreground`}>
                      {delivery.eventType}
                    </td>
                    <td className={`${CELL} ${outcomeColor(delivery)}`}>{outcome(delivery, t)}</td>
                    <td
                      className={`${CELL} whitespace-nowrap text-right tabular-nums text-muted-foreground`}
                    >
                      {delivery.durationMs === null
                        ? null
                        : t('webhooks.duration', { ms: delivery.durationMs })}
                    </td>
                    <td className={`${CELL} text-right`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!webhook.enabled || redeliver.isPending}
                        onClick={() => redeliver.mutate(delivery.id)}
                      >
                        {t('webhooks.redeliver')}
                        <span className="sr-only">
                          {t('webhooks.redeliverWhich', { event: delivery.eventType, when })}
                        </span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WebhookSection>
  );
}
