import { useMutation } from '@tanstack/react-query';
import { Button } from '@toppo-tracker/ui';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { ProjectWorkflow } from '../api/project-workflow.api.ts';

/**
 * "Customize for this project": gives the project a copy of the organization's workflow, to edit
 * as its own. Reports when done, or when another manager did it first.
 */
export function CustomizeButton({
  projectKey,
  onCustomized,
}: {
  projectKey: string;
  onCustomized: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const customizing = useMutation({
    mutationFn: () => ProjectWorkflow.customize(projectKey),
    // Done here or by someone else meanwhile (409): either way the project has its copy.
    onSettled: onCustomized,
  });

  return (
    <Button disabled={customizing.isPending} onClick={() => customizing.mutate()}>
      {customizing.isPending ? t('projectWorkflow.customizing') : t('projectWorkflow.customize')}
    </Button>
  );
}
