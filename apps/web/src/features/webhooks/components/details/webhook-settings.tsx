import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WebhookRequest, WebhookSummary } from '@toppo-tracker/shared';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { type ProjectPickerSlot, webhookForm } from '../../models/webhook-form.model.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { WebhookForm } from '../form/webhook-form.tsx';
import { WebhookSection } from '../webhook-section.tsx';

/** Where a webhook is sent, what of and in which projects, changed; its secret stays. */
export function WebhookSettings({
  webhook,
  projectPicker,
}: {
  webhook: WebhookSummary;
  projectPicker: ProjectPickerSlot;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (request: WebhookRequest) => Webhooks.update(webhook.id, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });

  return (
    <WebhookSection title={t('webhooks.settingsTitle')}>
      <WebhookForm
        initial={webhookForm(webhook)}
        projectPicker={projectPicker}
        submitLabel={t('webhooks.save')}
        pendingLabel={t('webhooks.saving')}
        pending={save.isPending}
        problem={save.isError ? requestErrorMessage(save.error, t, WEBHOOK_ERRORS) : undefined}
        done={save.isSuccess ? t('webhooks.saved') : undefined}
        onEdit={() => save.reset()}
        onSubmit={(request) => save.mutate(request)}
      />
    </WebhookSection>
  );
}
