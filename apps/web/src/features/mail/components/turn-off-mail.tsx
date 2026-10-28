import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@toppo-tracker/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Mail } from '../api/mail.api.ts';

/** Turns email off after asking: the settings and their password go. Reports it once done. */
export function TurnOffMail({ onTurnedOff }: { onTurnedOff: () => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const turnOff = useMutation({
    mutationFn: () => Mail.turnOff(),
    onSuccess: async () => {
      setOpen(false);
      await onTurnedOff();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        turnOff.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="self-start">
          {t('mail.turnOff')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('mail.turnOffTitle')}
        description={t('mail.turnOffDescription')}
        closeLabel={t('mail.close')}
      >
        {turnOff.isError ? (
          <Alert tone="danger" className="mb-4">
            {requestErrorMessage(turnOff.error, t)}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('mail.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" disabled={turnOff.isPending} onClick={() => turnOff.mutate()}>
            {t('mail.turnOffConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
