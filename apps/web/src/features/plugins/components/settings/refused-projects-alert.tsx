import { Link } from '@tanstack/react-router';
import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/**
 * The projects whose own settings a new version refuses, each linked to where they are set: the
 * plugin waits for them to be corrected before it is approved again.
 */
export function RefusedProjectsAlert({
  projects,
}: {
  projects: PluginDetailsResponse['settings']['refusedProjects'];
}) {
  const { t } = useI18n();

  return (
    <Alert tone="danger">
      <p>{t('plugins.projectSettingsRefused')}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {projects.map((project) => (
          <li key={project.key}>
            <Link
              to="/projects/$projectKey/plugins"
              params={{ projectKey: project.key }}
              className="font-medium underline underline-offset-2"
            >
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
