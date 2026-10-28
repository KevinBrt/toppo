import { Button, Dialog, DialogContent } from '@toppo-tracker/ui';
import { useI18n } from '../i18n/i18n-provider.tsx';

/** Asks before leaving a page with unsaved changes; `description` says what would be lost. */
export function LeaveDialog({
  open,
  description,
  onStay,
  onLeave,
}: {
  open: boolean;
  description: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onStay())}>
      <DialogContent
        title={t('unsaved.leaveTitle')}
        description={description}
        closeLabel={t('unsaved.close')}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onStay}>
            {t('unsaved.stay')}
          </Button>
          <Button variant="danger" onClick={onLeave}>
            {t('unsaved.leave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
