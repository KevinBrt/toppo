import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IssueSummary, ProjectIssuesQuery, UserRef } from '@toppo/shared';
import { Alert, Button, EmptyState } from '@toppo/ui';
import { PlusCircleIcon, SearchXIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Issues } from '../../api/issues.api.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import {
  hiddenFieldsOf,
  isNarrowed,
  orderOf,
  sortedBy,
  sortOf,
} from '../../utils/issue-list.util.ts';
import { PersonDialog } from '../fields/person-dialog.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { IssuesTable } from './issues-table.tsx';
import { IssuesToolbar } from './issues-toolbar.tsx';

const KNOWN_ERRORS = {
  INVALID_ASSIGNEE: 'issues.invalidAssignee',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;

/**
 * One page of a project's issues as the toolbar asks for them, each row opening its issue, the
 * fields the project hides left out. Who may assign issues gives an unassigned one to someone
 * from the list.
 */
export function IssuesList({
  projectKey,
  query,
  canAssign,
  seesEveryIssue,
  empty,
  onQueryChange,
}: {
  projectKey: string;
  query: ProjectIssuesQuery;
  canAssign: boolean;
  seesEveryIssue: boolean;
  /** Shown when the list is not searched nor filtered, and still empty. */
  empty: ReactNode;
  onQueryChange: (query: ProjectIssuesQuery) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const issues = useQuery(IssuesQueries.list(projectKey, query));
  const fields = useQuery(IssuesQueries.fields(projectKey));
  const hidden = hiddenFieldsOf(fields.data?.fieldSettings);
  const [failure, setFailure] = useState<unknown>(null);

  const assign = useMutation({
    mutationFn: ({ key, assignee }: { key: string; assignee: UserRef | null }) =>
      Issues.assign(key, assignee?.id ?? null),
    onMutate: () => setFailure(null),
    onError: setFailure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: IssuesQueries.allOf(projectKey) }),
  });

  return (
    <div className="flex flex-col gap-4">
      <IssuesToolbar
        projectKey={projectKey}
        query={query}
        seesEveryIssue={seesEveryIssue}
        canListPeople={canAssign}
        hidden={hidden}
        onQueryChange={onQueryChange}
      />
      {failure ? (
        <Alert tone="danger">{requestErrorMessage(failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      <IssuesTable
        issues={issues}
        grouping={query.group}
        hidden={hidden}
        empty={
          isNarrowed(query) ? (
            <EmptyState
              icon={SearchXIcon}
              title={t('issues.list.noMatchTitle')}
              description={t('issues.list.noMatchDescription')}
            />
          ) : (
            empty
          )
        }
        last={{
          header: t('issues.assignee'),
          sort: 'assignee',
          cell: (issue) => (
            <AssigneeCell
              issue={issue}
              projectKey={projectKey}
              canAssign={canAssign}
              onAssign={(assignee) => assign.mutate({ key: issue.key, assignee })}
            />
          ),
        }}
        sorting={{
          sort: sortOf(query),
          order: orderOf(query),
          onSort: (sort) => onQueryChange(sortedBy(query, sort)),
        }}
        onPage={(page) => onQueryChange({ ...query, page })}
      />
    </div>
  );
}

/** Who the issue goes to, or the way to give it to someone for who may. */
function AssigneeCell({
  issue,
  projectKey,
  canAssign,
  onAssign,
}: {
  issue: IssueSummary;
  projectKey: string;
  canAssign: boolean;
  onAssign: (assignee: UserRef | null) => void;
}) {
  const { t } = useI18n();

  if (issue.assignee) {
    return <PersonName person={issue.assignee} />;
  }
  if (canAssign) {
    return <AssignButton issue={issue} projectKey={projectKey} onAssign={onAssign} />;
  }
  return <span className="text-muted-foreground">{t('issues.unassigned')}</span>;
}

/** "Assign": above the row's link, opening the choice of people. */
function AssignButton({
  issue,
  projectKey,
  onAssign,
}: {
  issue: IssueSummary;
  projectKey: string;
  onAssign: (assignee: UserRef | null) => void;
}) {
  const { t } = useI18n();
  const [choosing, setChoosing] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('issues.assignTitle', { key: issue.key })}
        onClick={() => setChoosing(true)}
        className="relative z-10 -ml-3 text-primary"
      >
        <PlusCircleIcon aria-hidden="true" />
        {t('issues.assign')}
      </Button>
      <PersonDialog
        projectKey={projectKey}
        title={t('issues.assignTitle', { key: issue.key })}
        current={null}
        open={choosing}
        onOpenChange={setChoosing}
        onChoose={onAssign}
      />
    </>
  );
}
