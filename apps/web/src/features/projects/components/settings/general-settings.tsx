import type { ProjectResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { DangerZone } from './danger-zone.tsx';
import { GeneralForm } from './general-form.tsx';

/**
 * A project's general page: its identity, read-only while archived, then what cannot be done
 * lightly. Reports a new key and the deletion, for the screen to follow them.
 */
export function GeneralSettings({
  project,
  canDelete,
  onKeyChanged,
  onDeleted,
}: {
  project: ProjectResponse;
  /** Deleting projects is an instance permission: the screen knows whether the user holds it. */
  canDelete: boolean;
  onKeyChanged: (key: string) => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {project.archived ? (
        <Alert>{t('projects.archivedNotice')}</Alert>
      ) : (
        <GeneralForm project={project} onKeyChanged={onKeyChanged} />
      )}
      <DangerZone project={project} canDelete={canDelete} onDeleted={onDeleted} />
    </div>
  );
}
