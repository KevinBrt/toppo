import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WebhookSummary } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@toppo-tracker/ui';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';

/**
 * "Delete" and its confirmation: the webhook goes with its deliveries, those still to send
 * included. Reports it once done, for the screen to leave its page.
 */
export function DeleteWebhookDialog({
  webhook,
  onDeleted,
}: {
  webhook: WebhookSummary;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => Webhooks.remove(webhook.id),
    onSuccess: async () => {
      setOpen(false);
      await onDeleted();
      // After leaving its page: its own query would only answer 404 now.
      queryClient.removeQueries({ queryKey: WebhooksQueries.detail(webhook.id).queryKey });
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        remove.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="text-danger hover:text-danger">
          <Trash2Icon aria-hidden="true" />
          {t('webhooks.delete')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('webhooks.deleteConfirmTitle', { name: webhook.name })}
        description={t('webhooks.deleteConfirmDescription')}
        closeLabel={t('webhooks.close')}
      >
        <div className="flex flex-col gap-4">
          {remove.isError ? (
            <Alert tone="danger">{requestErrorMessage(remove.error, t, WEBHOOK_ERRORS)}</Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('webhooks.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t('webhooks.deleteConfirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
