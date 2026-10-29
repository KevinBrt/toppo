import { useMutation } from '@tanstack/react-query';
import type { WebhookSummary } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@toppo-tracker/ui';
import { KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { WebhookSecret } from '../webhook-secret.tsx';
import { WebhookSection } from '../webhook-section.tsx';

/** The headers each request carries, named by the Standard Webhooks specification in any language. */
const SIGNATURE_HEADERS = ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const;

/**
 * How a webhook's requests are signed, and a new secret in place of the old one, which stops
 * working at once: confirmed first, then shown this once.
 */
export function WebhookSigning({ webhook }: { webhook: WebhookSummary }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const renew = useMutation({ mutationFn: () => Webhooks.renewSecret(webhook.id) });

  return (
    <WebhookSection title={t('webhooks.signingTitle')} description={t('webhooks.signingHelp')}>
      <ul className="flex flex-col gap-1 font-mono text-xs text-foreground">
        {SIGNATURE_HEADERS.map((header) => (
          <li key={header}>{header}</li>
        ))}
      </ul>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          renew.reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="secondary" className="self-start">
            <KeyRoundIcon aria-hidden="true" />
            {t('webhooks.renewSecret')}
          </Button>
        </DialogTrigger>
        <DialogContent
          title={renew.isSuccess ? t('webhooks.secretTitle') : t('webhooks.renewConfirmTitle')}
          description={
            renew.isSuccess
              ? t('webhooks.secretRenewedDescription')
              : t('webhooks.renewConfirmDescription')
          }
          closeLabel={t('webhooks.close')}
        >
          {renew.isSuccess ? (
            <WebhookSecret secret={renew.data} onDone={() => setOpen(false)} />
          ) : (
            <div className="flex flex-col gap-4">
              {renew.isError ? (
                <Alert tone="danger">{requestErrorMessage(renew.error, t, WEBHOOK_ERRORS)}</Alert>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button variant="secondary">{t('webhooks.cancel')}</Button>
                </DialogClose>
                <Button disabled={renew.isPending} onClick={() => renew.mutate()}>
                  {t('webhooks.renewConfirm')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </WebhookSection>
  );
}
