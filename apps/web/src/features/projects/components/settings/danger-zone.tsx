import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectResponse } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@toppo-tracker/ui';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Projects } from '../../api/projects.api.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';
import { DeleteProjectDialog } from './delete-project-dialog.tsx';

/**
 * What cannot be done lightly: archiving the project or bringing it back, and deleting it for
 * those who may. Reports the deletion, for the screen to leave the project.
 */
export function DangerZone({
  project,
  canDelete,
  onDeleted,
}: {
  project: ProjectResponse;
  canDelete: boolean;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-danger/30 bg-surface shadow-xs"
    >
      <h2 id={titleId} className="px-5 pt-5 text-base font-semibold text-danger">
        {t('projectSettings.dangerZone')}
      </h2>
      <div className="divide-y divide-border">
        <ArchiveRow project={project} />
        {canDelete ? (
          <DangerRow
            title={t('projectSettings.deleteTitle')}
            description={t('projectSettings.deleteDescription')}
          >
            <DeleteProjectDialog project={project} onDeleted={onDeleted} />
          </DangerRow>
        ) : null}
      </div>
    </section>
  );
}

function DangerRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-end sm:self-auto">{children}</div>
    </div>
  );
}

/** Archiving asks first; bringing a project back does not, it undoes nothing. */
function ArchiveRow({ project }: { project: ProjectResponse }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const change = useMutation({
    mutationFn: () =>
      project.archived ? Projects.unarchive(project.key) : Projects.archive(project.key),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ProjectsQueries.all });
    },
  });

  const error = change.isError ? (
    <Alert tone="danger" className="mt-2">
      {requestErrorMessage(change.error, t)}
    </Alert>
  ) : null;
  if (project.archived) {
    return (
      <DangerRow
        title={t('projectSettings.unarchiveTitle')}
        description={t('projectSettings.unarchiveDescription')}
      >
        <Button variant="secondary" disabled={change.isPending} onClick={() => change.mutate()}>
          <ArchiveRestoreIcon aria-hidden="true" />
          {t('projectSettings.unarchive')}
        </Button>
        {error}
      </DangerRow>
    );
  }
  return (
    <DangerRow
      title={t('projectSettings.archiveTitle')}
      description={t('projectSettings.archiveDescription')}
    >
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            <ArchiveIcon aria-hidden="true" />
            {t('projectSettings.archive')}
          </Button>
        </DialogTrigger>
        <DialogContent
          title={t('projectSettings.archiveConfirmTitle', { name: project.name })}
          description={t('projectSettings.archiveDescription')}
          closeLabel={t('projectSettings.close')}
        >
          {error}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('projectSettings.cancel')}</Button>
            </DialogClose>
            <Button disabled={change.isPending} onClick={() => change.mutate()}>
              {t('projectSettings.archiveConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DangerRow>
  );
}
