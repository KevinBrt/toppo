import { Link } from '@tanstack/react-router';
import type { ProjectResponse } from '@toppo-tracker/shared';
import { ChevronLeftIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ProjectMark } from '../project-mark.tsx';

/** The way back to every project, and the project its pages are about. */
export function ProjectIdentity({ project }: { project: ProjectResponse }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4 px-3">
      <Link
        to="/projects"
        className="-ml-1 flex min-h-8 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        {t('projectAdmin.allProjects')}
      </Link>
      <div className="flex min-w-0 items-center gap-3">
        <ProjectMark name={project.name} color={project.color} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{project.key}</p>
        </div>
      </div>
    </div>
  );
}
