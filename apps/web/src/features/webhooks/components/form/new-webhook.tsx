import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WebhookRequest, WebhookSecretResponse } from '@toppo-tracker/shared';
import { Dialog, DialogContent } from '@toppo-tracker/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { type ProjectPickerSlot, webhookForm } from '../../models/webhook-form.model.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { WebhookSecret } from '../webhook-secret.tsx';
import { WebhookForm } from './webhook-form.tsx';

/**
 * A new webhook's form; once added, its secret, shown this once to be copied into its receiver.
 * Reports it added when the secret is put away, for the screen to open its page.
 */
export function NewWebhook({
  projectPicker,
  onCreated,
}: {
  projectPicker: ProjectPickerSlot;
  onCreated: (id: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<WebhookSecretResponse | null>(null);
  const create = useMutation({
    mutationFn: (request: WebhookRequest) => Webhooks.create(request),
    onSuccess: async (answer) => {
      setCreated(answer);
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });

  return (
    <div className="max-w-3xl rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
      <WebhookForm
        initial={webhookForm()}
        projectPicker={projectPicker}
        submitLabel={t('webhooks.create')}
        pendingLabel={t('webhooks.creating')}
        pending={create.isPending || created !== null}
        problem={create.isError ? requestErrorMessage(create.error, t, WEBHOOK_ERRORS) : undefined}
        onEdit={() => create.reset()}
        onSubmit={(request) => create.mutate(request)}
      />
      <Dialog
        open={created !== null}
        onOpenChange={async (open) => {
          if (!open && created) {
            await onCreated(created.id);
          }
        }}
      >
        <DialogContent
          title={t('webhooks.secretTitle')}
          description={t('webhooks.secretCreatedDescription')}
          closeLabel={t('webhooks.close')}
        >
          {created ? (
            <WebhookSecret secret={created.secret} onDone={() => onCreated(created.id)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
