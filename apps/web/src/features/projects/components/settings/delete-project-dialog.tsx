import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectResponse } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
} from '@toppo-tracker/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Projects } from '../../api/projects.api.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';

/**
 * "Delete" and its confirmation: the project's key must be typed, so that no project goes by a
 * slip of the finger. Reports the deletion once done.
 */
export function DeleteProjectDialog({
  project,
  onDeleted,
}: {
  project: ProjectResponse;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const remove = useMutation({
    mutationFn: () => Projects.delete(project.key),
    onSuccess: async () => {
      setOpen(false);
      await onDeleted();
      // After leaving the project: its own queries would only answer 404 now.
      queryClient.removeQueries({ queryKey: ProjectsQueries.detail(project.key).queryKey });
      await queryClient.invalidateQueries({ queryKey: ProjectsQueries.all });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          remove.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="text-danger hover:text-danger">
          {t('projectSettings.delete')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('projectSettings.deleteConfirmTitle', { name: project.name })}
        description={t('projectSettings.deleteConfirmDescription')}
        closeLabel={t('projectSettings.close')}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (typed === project.key) {
              remove.mutate();
            }
          }}
          className="flex flex-col gap-5"
        >
          {remove.isError ? (
            <Alert tone="danger">{requestErrorMessage(remove.error, t)}</Alert>
          ) : null}
          <Field label={t('projectSettings.deleteKey', { key: project.key })} required>
            {(control) => (
              <Input
                {...control}
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value.toUpperCase())}
                className="font-mono"
              />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('projectSettings.cancel')}</Button>
            </DialogClose>
            <Button
              type="submit"
              variant="danger"
              disabled={typed !== project.key || remove.isPending}
            >
              {remove.isPending
                ? t('projectSettings.deleting')
                : t('projectSettings.deleteConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
