import type { UserSummary } from '@toppo-tracker/shared';
import { Button, Dialog, DialogClose, DialogContent } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** Asks before erasing a member: it cannot be undone, unlike a deactivation. */
export function DeleteMemberDialog({
  member,
  open,
  onOpenChange,
  onConfirm,
  onClosed,
}: {
  member: UserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Where focus goes back once the dialog is closed, e.g. the menu that opened it. */
  onClosed: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('members.deleteTitle', { name: member.name })}
        description={t('members.deleteDescription')}
        closeLabel={t('invitations.close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('members.cancel')}</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t('members.deleteConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
