import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IssueResponse } from '@toppo-tracker/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Issues } from '../../api/issues.api.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';

/** Asks before deleting an issue for good; reports the deletion once done. */
export function DeleteIssueDialog({
  issue,
  open,
  onOpenChange,
  onDeleted,
}: {
  issue: IssueResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => Issues.delete(issue.key),
    onSuccess: async () => {
      onOpenChange(false);
      await onDeleted();
      // After leaving its page: the issue would only answer 404 now.
      queryClient.removeQueries({ queryKey: IssuesQueries.detail(issue.key).queryKey });
      await queryClient.invalidateQueries({ queryKey: IssuesQueries.allOf(issue.project.key) });
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
        title={t('issues.deleteTitle', { key: issue.key })}
        description={t('issues.deleteDescription')}
        closeLabel={t('issues.close')}
      >
        {remove.isError ? (
          <Alert tone="danger" className="mb-4">
            {requestErrorMessage(remove.error, t)}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('issues.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('issues.deleting') : t('issues.deleteConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
