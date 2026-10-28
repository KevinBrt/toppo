import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkIssuesResponse,
  IssueSummary,
  ProjectIssuesQuery,
  UserRef,
} from '@toppo-tracker/shared';
import { Alert, Button, cn, EmptyState } from '@toppo-tracker/ui';
import { PlusCircleIcon, SearchXIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Issues } from '../../api/issues.api.ts';
import type { BulkChange, IssueSelection } from '../../models/bulk-change.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import {
  hiddenFieldsOf,
  isNarrowed,
  orderOf,
  sortedBy,
  sortOf,
} from '../../utils/issue-list.util.ts';
import { BulkBar, type BulkPermissions } from '../bulk/bulk-bar.tsx';
import { BulkOutcome } from '../bulk/bulk-outcome.tsx';
import { PersonDialog } from '../fields/person-dialog.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { IssuesTable } from './issues-table.tsx';
import { IssuesToolbar } from './issues-toolbar.tsx';

const KNOWN_ERRORS = {
  INVALID_ASSIGNEE: 'issues.invalidAssignee',
  INVALID_CATEGORY: 'issues.invalidCategory',
  INVALID_PRIORITY: 'issues.invalidPriority',
  INVALID_LABEL: 'issues.invalidLabel',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;

/** What an action on several issues did, for the page and filters it was taken on. */
interface BulkDone {
  scope: string;
  action: BulkChange['action'];
  outcome: BulkIssuesResponse;
}

/**
 * One page of a project's issues as the toolbar asks for them, each row opening its issue, the
 * fields the project hides left out. Who may assign issues gives an unassigned one to someone
 * from the list. Who may change, assign or delete issues ticks some of the page and acts on them
 * at once; the ticks go with the page or the filters.
 */
export function IssuesList({
  projectKey,
  query,
  can,
  seesEveryIssue,
  empty,
  onQueryChange,
}: {
  projectKey: string;
  query: ProjectIssuesQuery;
  /** What the caller may do on the project's issues; nothing while it is archived. */
  can: BulkPermissions;
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
  const scope = JSON.stringify([projectKey, query]);
  const [ticked, setTicked] = useState<{ scope: string; keys: readonly string[] }>({
    scope,
    keys: [],
  });
  const [done, setDone] = useState<BulkDone | null>(null);
  const rows = issues.data?.rows ?? [];
  // Ticks of another page or filters are gone, as are those of issues no longer listed.
  const selected =
    ticked.scope === scope ? ticked.keys.filter((key) => rows.some((row) => row.key === key)) : [];
  const selection: IssueSelection | undefined =
    can.update || can.assign || can.delete
      ? {
          selected,
          onSelect: (keys, on) =>
            setTicked({
              scope,
              keys: on
                ? [...new Set([...selected, ...keys])]
                : selected.filter((key) => !keys.includes(key)),
            }),
        }
      : undefined;

  const bulk = useMutation({
    mutationFn: ({ keys, change }: { keys: readonly string[]; change: BulkChange }) =>
      Issues.bulk(projectKey, keys, change),
    onMutate: () => {
      setFailure(null);
      setDone(null);
    },
    onSuccess: (outcome, { change }) => {
      setDone({ scope, action: change.action, outcome });
      // Those refused stay ticked, to be acted on otherwise.
      setTicked({ scope, keys: outcome.refused.map(({ key }) => key) });
    },
    onError: setFailure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: IssuesQueries.all }),
  });

  const assign = useMutation({
    mutationFn: ({ key, assignee }: { key: string; assignee: UserRef | null }) =>
      Issues.assign(key, assignee?.id ?? null),
    onMutate: () => setFailure(null),
    onError: setFailure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: IssuesQueries.allOf(projectKey) }),
  });

  return (
    <div className={cn('flex flex-col gap-4', selected.length > 0 && 'pb-36 sm:pb-24')}>
      <IssuesToolbar
        projectKey={projectKey}
        query={query}
        seesEveryIssue={seesEveryIssue}
        canListPeople={can.assign}
        hidden={hidden}
        onQueryChange={onQueryChange}
      />
      {failure ? (
        <Alert tone="danger">{requestErrorMessage(failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      {done?.scope === scope ? <BulkOutcome action={done.action} outcome={done.outcome} /> : null}
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
              canAssign={can.assign}
              onAssign={(assignee) => assign.mutate({ key: issue.key, assignee })}
            />
          ),
        }}
        sorting={{
          sort: sortOf(query),
          order: orderOf(query),
          onSort: (sort) => onQueryChange(sortedBy(query, sort)),
        }}
        selection={selection}
        onPage={(page) => onQueryChange({ ...query, page })}
      />
      {selected.length > 0 ? (
        <BulkBar
          projectKey={projectKey}
          count={selected.length}
          fields={fields.data}
          hidden={hidden}
          can={can}
          pending={bulk.isPending}
          onApply={(change) => bulk.mutate({ keys: selected, change })}
          onClear={() => setTicked({ scope, keys: [] })}
        />
      ) : null}
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
