import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useBlocker } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import type { ProjectWorkflowResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useState } from 'react';
import { IssuesQueries } from '../../../features/issues/queries/issues.queries.ts';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { ProjectWorkflow } from '../../../features/workflows/api/project-workflow.api.ts';
import { CustomizeButton } from '../../../features/workflows/components/customize-button.tsx';
import { RevertDialog } from '../../../features/workflows/components/revert-dialog.tsx';
import { WorkflowEditor } from '../../../features/workflows/components/workflow-editor.tsx';
import { WorkflowsQueries } from '../../../features/workflows/queries/workflows.queries.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { LeaveDialog } from '../../../shared/forms/leave-dialog.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectRoute } from './project.route.tsx';

/**
 * The statuses a project's issues go through: the organization's workflow, shown as it is while
 * the project follows it, or the project's own copy, edited like the organization's.
 */
export const projectStatusesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'statuses',
  component: ProjectStatusesScreen,
});

function ProjectStatusesScreen() {
  const { t } = useI18n();
  const { projectKey } = projectStatusesRoute.useParams();
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));
  const allowed = Boolean(project && can(project.permissions, 'project.settings.manage'));
  const workflow = useQuery({ ...WorkflowsQueries.project(projectKey), enabled: allowed });
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  // Unsaved changes are not lost by a click elsewhere, nor by closing the tab.
  const leaving = useBlocker({
    shouldBlockFn: () => pending,
    enableBeforeUnload: () => pending,
    withResolver: true,
  });
  // The project's issues offer the statuses and moves of the workflow it now follows.
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WorkflowsQueries.all }),
      queryClient.invalidateQueries({ queryKey: IssuesQueries.all }),
    ]);
  };

  if (!project) {
    return null;
  }
  if (!allowed) {
    return (
      <Page title={t('workflow.title')}>
        <AccessDenied />
      </Page>
    );
  }
  const data = workflow.data;

  return (
    <Page
      title={t('workflow.title')}
      description={t('projectWorkflow.description')}
      actions={
        data && !project.archived ? (
          <WorkflowActions
            projectKey={projectKey}
            workflow={data}
            pending={pending}
            onChanged={refresh}
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {project.archived ? <Alert>{t('projects.archivedNotice')}</Alert> : null}
        {workflow.isError ? (
          <Alert tone="danger">{requestErrorMessage(workflow.error, t)}</Alert>
        ) : null}
        {workflow.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('workflow.loading')}
          </p>
        ) : null}
        {data ? (
          <>
            <Alert>
              {data.customized ? t('projectWorkflow.customized') : t('projectWorkflow.following')}
            </Alert>
            <WorkflowEditor
              // Following or customized: each starts again from what is saved.
              key={data.customized ? 'own' : 'organization'}
              workflow={data}
              readOnly={!data.customized || project.archived}
              save={(request) => ProjectWorkflow.save(projectKey, request)}
              onSaved={refresh}
              onPendingChange={setPending}
            />
          </>
        ) : null}
      </div>
      <LeaveDialog
        open={leaving.status === 'blocked'}
        description={t('workflow.leaveDescription')}
        onStay={() => leaving.reset?.()}
        onLeave={() => leaving.proceed?.()}
      />
    </Page>
  );
}

/** Customize the workflow the project follows, or go back to the organization's. */
function WorkflowActions({
  projectKey,
  workflow,
  pending,
  onChanged,
}: {
  projectKey: string;
  workflow: ProjectWorkflowResponse;
  /** The workflow has unsaved changes: they would be lost. */
  pending: boolean;
  onChanged: () => Promise<void>;
}) {
  if (workflow.customized) {
    return (
      <RevertDialog
        projectKey={projectKey}
        workflow={workflow}
        disabled={pending}
        onReverted={onChanged}
      />
    );
  }
  return <CustomizeButton projectKey={projectKey} onCustomized={onChanged} />;
}
