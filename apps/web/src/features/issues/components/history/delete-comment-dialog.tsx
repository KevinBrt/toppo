import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogClose, DialogContent } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Comments } from '../../api/comments.api.ts';
import { COMMENT_ERRORS } from '../../constants/comments.constants.ts';

/** Asks before deleting a comment for good; reports the deletion once done. */
export function DeleteCommentDialog({
  issueKey,
  commentId,
  open,
  onOpenChange,
  onDeleted,
}: {
  issueKey: string;
  commentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => Promise<void>;
}) {
  const { t } = useI18n();
  const remove = useMutation({
    mutationFn: () => Comments.remove(issueKey, commentId),
    onSuccess: async () => {
      onOpenChange(false);
      await onDeleted();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        remove.reset();
      }}
    >
      <DialogContent
        title={t('issues.comments.deleteTitle')}
        description={t('issues.comments.deleteDescription')}
        closeLabel={t('issues.close')}
      >
        {remove.isError ? (
          <Alert tone="danger" className="mb-4">
            {requestErrorMessage(remove.error, t, COMMENT_ERRORS)}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('issues.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('issues.comments.deleting') : t('issues.comments.deleteConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
