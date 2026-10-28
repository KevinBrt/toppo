import { useMutation } from '@tanstack/react-query';
import type { IssueAttachment } from '@toppo-tracker/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Attachments } from '../../api/attachments.api.ts';
import { ATTACHMENT_ERRORS } from '../../constants/attachments.constants.ts';

/** Asks before removing a file for good; reports the removal once done. */
export function RemoveAttachmentDialog({
  issueKey,
  attachment,
  onClose,
  onRemoved,
}: {
  issueKey: string;
  /** The file to remove; none while the dialog is closed. */
  attachment: IssueAttachment | null;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const remove = useMutation({
    mutationFn: (attachmentId: string) => Attachments.remove(issueKey, attachmentId),
    onSuccess: async () => {
      onClose();
      await onRemoved();
    },
  });

  return (
    <Dialog
      open={attachment !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
        remove.reset();
      }}
    >
      <DialogContent
        title={t('issues.attachments.removeTitle')}
        description={t('issues.attachments.removeDescription', {
          name: attachment?.fileName ?? '',
        })}
        closeLabel={t('issues.close')}
      >
        {remove.isError ? (
          <Alert tone="danger" className="mb-4">
            {requestErrorMessage(remove.error, t, ATTACHMENT_ERRORS)}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('issues.cancel')}</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => attachment && remove.mutate(attachment.id)}
          >
            {remove.isPending
              ? t('issues.attachments.removing')
              : t('issues.attachments.removeConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
