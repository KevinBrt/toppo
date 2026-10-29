import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WEBHOOK_FAILURES_BEFORE_DISABLING, type WebhookSummary } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { deliveryProblem, webhookState } from '../../utils/webhook-state.util.ts';

/**
 * Says that a webhook's deliveries are given up, and why the last one was: a warning while it
 * still runs, and once Toppo stopped it, a way to enable it again, its failures counted from zero.
 */
export function WebhookFailingAlert({ webhook }: { webhook: WebhookSummary }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const enable = useMutation({
    mutationFn: () => Webhooks.enable(webhook.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });
  const state = webhookState(webhook);
  const why = deliveryProblem({ status: null, error: webhook.lastError }, t);

  if (state === 'enabled') {
    return (
      <Alert>
        <p>
          {t(`webhooks.failing.${pluralForm(locale, webhook.failures)}`, {
            count: webhook.failures,
            max: WEBHOOK_FAILURES_BEFORE_DISABLING,
          })}
        </p>
        {why ? <p className="mt-1">{t('webhooks.lastProblem', { why })}</p> : null}
      </Alert>
    );
  }
  return (
    <Alert tone="danger">
      <p>
        {t(`webhooks.stopped.${pluralForm(locale, webhook.failures)}`, {
          count: webhook.failures,
        })}
      </p>
      {why ? <p className="mt-1">{t('webhooks.lastProblem', { why })}</p> : null}
      {enable.isError ? (
        <p className="mt-2 font-medium">{requestErrorMessage(enable.error, t, WEBHOOK_ERRORS)}</p>
      ) : null}
      <Button
        variant="secondary"
        className="mt-3"
        disabled={enable.isPending}
        onClick={() => enable.mutate()}
      >
        {t('webhooks.enableAgain')}
      </Button>
    </Alert>
  );
}
