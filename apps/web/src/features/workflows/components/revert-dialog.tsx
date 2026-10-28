import { useMutation } from '@tanstack/react-query';
import type { ProjectWorkflowResponse } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Select,
} from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { ProjectWorkflow } from '../api/project-workflow.api.ts';

const KNOWN_ERRORS = {
  MOVE_REQUIRED: 'projectWorkflow.moveRequired',
  NOT_CUSTOMIZED: 'workflow.notCustomized',
} as const;

/**
 * "Go back to the organization's workflow": asks where the issues on each status of the project
 * that the organization lacks go, then makes the project follow it again. Reports when done.
 */
export function RevertDialog({
  projectKey,
  workflow,
  disabled,
  onReverted,
}: {
  projectKey: string;
  workflow: ProjectWorkflowResponse;
  /** While the workflow has unsaved changes. */
  disabled: boolean;
  onReverted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const organization = workflow.organization;
  const initial = organization.find(({ isInitial }) => isInitial)?.id ?? '';
  // Statuses the organization lacks, with issues of the project on them: those move.
  const moving = workflow.statuses.filter(
    ({ id, issueCount }) => issueCount > 0 && !organization.some((status) => status.id === id),
  );
  const [targets, setTargets] = useState<Record<string, string>>({});
  const targetOf = (statusId: string) => targets[statusId] ?? initial;

  const reverting = useMutation({
    mutationFn: () =>
      ProjectWorkflow.revert(
        projectKey,
        moving.map(({ id }) => ({ statusId: id, moveTo: targetOf(id) })),
      ),
    onSuccess: async () => {
      setOpen(false);
      await onReverted();
    },
  });

  function revert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reverting.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          {t('projectWorkflow.revert')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('projectWorkflow.revertTitle')}
        description={t('projectWorkflow.revertDescription')}
        closeLabel={t('projectWorkflow.close')}
      >
        <form noValidate onSubmit={revert} className="flex flex-col gap-5">
          {reverting.isError ? (
            <Alert tone="danger">{requestErrorMessage(reverting.error, t, KNOWN_ERRORS)}</Alert>
          ) : null}
          {moving.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('projectWorkflow.revertNothing')}</p>
          ) : (
            moving.map((status) => (
              <Field
                key={status.id}
                label={t('projectWorkflow.moveFrom', {
                  name: status.name,
                  count: status.issueCount,
                })}
              >
                {(control) => (
                  <Select
                    {...control}
                    value={targetOf(status.id)}
                    onChange={(event) =>
                      setTargets((current) => ({ ...current, [status.id]: event.target.value }))
                    }
                  >
                    {organization.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('projectWorkflow.cancel')}</Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={reverting.isPending}>
              {reverting.isPending
                ? t('projectWorkflow.reverting')
                : t('projectWorkflow.revertConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
