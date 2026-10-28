import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useBlocker } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { Alert } from '@toppo-tracker/ui';
import { useState } from 'react';
import { IssuesQueries } from '../../../features/issues/queries/issues.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { Workflow } from '../../../features/workflows/api/workflow.api.ts';
import { WorkflowEditor } from '../../../features/workflows/components/workflow-editor.tsx';
import { WorkflowsQueries } from '../../../features/workflows/queries/workflows.queries.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { LeaveDialog } from '../../../shared/forms/leave-dialog.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { settingsRoute } from './settings.route.tsx';

/** The instance's workflow: its statuses, and which may follow which. */
export const statusesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'statuses',
  staticData: { titleKey: 'workflow.title' },
  component: StatusesScreen,
});

function StatusesScreen() {
  const { t } = useI18n();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const allowed = Boolean(user && can(user.permissions, 'instance.settings.manage'));
  const workflow = useQuery({ ...WorkflowsQueries.instance, enabled: allowed });
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  // Unsaved changes are not lost by a click elsewhere, nor by closing the tab.
  const leaving = useBlocker({
    shouldBlockFn: () => pending,
    enableBeforeUnload: () => pending,
    withResolver: true,
  });

  if (!allowed) {
    return (
      <Page title={t('workflow.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page title={t('workflow.title')} description={t('workflow.description')}>
      {workflow.isError ? (
        <Alert tone="danger">{requestErrorMessage(workflow.error, t)}</Alert>
      ) : null}
      {workflow.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('workflow.loading')}
        </p>
      ) : null}
      {workflow.data ? (
        <WorkflowEditor
          workflow={workflow.data}
          save={(request) => Workflow.save(request)}
          // The issues' forms offer the new statuses and moves at once.
          onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: WorkflowsQueries.all }),
              queryClient.invalidateQueries({ queryKey: IssuesQueries.all }),
            ]);
          }}
          onPendingChange={setPending}
        />
      ) : null}
      <LeaveDialog
        open={leaving.status === 'blocked'}
        description={t('workflow.leaveDescription')}
        onStay={() => leaving.reset?.()}
        onLeave={() => leaving.proceed?.()}
      />
    </Page>
  );
}
