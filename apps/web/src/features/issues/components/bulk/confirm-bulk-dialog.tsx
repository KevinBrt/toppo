import { Button, Dialog, DialogClose, DialogContent } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { BulkChange } from '../../models/bulk-change.model.ts';

/** An action chosen in the bar, waiting for its confirmation: what it does, as a question. */
export interface BulkConfirmation {
  change: BulkChange;
  title: string;
}

/**
 * Asks before an action on several issues, which changes them all at once: a deletion as a danger,
 * for good. Reports the answer.
 */
export function ConfirmBulkDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: BulkConfirmation | null;
  onCancel: () => void;
  onConfirm: (change: BulkChange) => void;
}) {
  const { t } = useI18n();
  const deletes = confirmation?.change.action === 'delete';

  return (
    <Dialog
      open={confirmation !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent
        title={confirmation?.title ?? ''}
        description={t(
          deletes ? 'issues.bulk.deleteDescription' : 'issues.bulk.confirmDescription',
        )}
        closeLabel={t('issues.close')}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('issues.cancel')}</Button>
          </DialogClose>
          <Button
            variant={deletes ? 'danger' : 'primary'}
            onClick={() => {
              if (confirmation) {
                onConfirm(confirmation.change);
              }
            }}
          >
            {deletes ? t('issues.deleteConfirm') : t('issues.bulk.apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
