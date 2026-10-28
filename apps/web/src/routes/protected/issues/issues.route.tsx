import { useQuery } from '@tanstack/react-query';
import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { can, parseIssueKey } from '@toppo-tracker/core';
import { ProjectSwitcher } from '../../../features/projects/components/picker/project-switcher.tsx';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import {
  CRUMB_CURRENT_CLASS,
  CRUMB_LINK_CLASS,
  type CrumbProps,
  CrumbSeparator,
} from '../../../shared/layout/topbar.tsx';
import { protectedRoute } from '../protected.route.tsx';

/** The project whose issues are shown: the one of the issue on its page, else the one chosen. */
function projectKeyOf({ params, search }: Pick<CrumbProps, 'params' | 'search'>): string | null {
  const issueKey = params['issueKey'];
  if (issueKey) {
    return parseIssueKey(issueKey)?.projectKey ?? null;
  }
  return typeof search['project'] === 'string' ? search['project'] : null;
}

/**
 * "Projects / [project] ▾ / Issues" in the top bar: the projects screen for those who see it, a
 * menu to switch projects, and the way back to the list from an issue.
 */
function IssuesCrumb({ params, search, current }: CrumbProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const projectKey = projectKeyOf({ params, search });
  const { data: user } = useQuery(SessionQueries.currentUser);
  const { data: project } = useQuery({
    ...ProjectsQueries.detail(projectKey ?? ''),
    enabled: projectKey !== null,
  });
  const seesProjects = user
    ? can(user.permissions, 'project.create') || user.managesProjects
    : false;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* Left out on phones: the project and the issue need the room. */}
      {seesProjects ? (
        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Link to="/projects" className={CRUMB_LINK_CLASS}>
            {t('nav.projects')}
          </Link>
          <CrumbSeparator />
        </span>
      ) : null}
      <ProjectSwitcher
        current={project ? { key: project.key, name: project.name, color: project.color } : null}
        onSelect={(key) => navigate({ to: '/issues', search: { project: key } })}
      />
      <CrumbSeparator />
      {current || !projectKey ? (
        <span aria-current={current ? 'page' : undefined} className={CRUMB_CURRENT_CLASS}>
          {t('issues.title')}
        </span>
      ) : (
        <Link
          to="/issues"
          search={{ project: projectKey }}
          className={`shrink-0 ${CRUMB_LINK_CLASS}`}
        >
          {t('issues.title')}
        </Link>
      )}
    </span>
  );
}

/** The issues: those of one project at a time, a new one, and each issue's page. */
export const issuesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/issues',
  staticData: { crumb: IssuesCrumb },
});
