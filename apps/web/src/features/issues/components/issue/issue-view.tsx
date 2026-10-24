import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IssueResponse, UserRef } from '@toppo/shared';
import { Alert } from '@toppo/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Issues } from '../../api/issues.api.ts';
import type { IssueEdit } from '../../models/issue-edit.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { applyEdit } from '../../utils/issue-edit.util.ts';
import { IssueHistory } from '../history/issue-history.tsx';
import { IssueHeader } from './issue-header.tsx';
import { IssueProperties } from './issue-properties.tsx';
import { IssueRequest } from './issue-request.tsx';

const KNOWN_ERRORS = {
  STATUS_NOT_ALLOWED: 'issues.statusNotAllowed',
  INVALID_ASSIGNEE: 'issues.invalidAssignee',
  INVALID_CATEGORY: 'issues.invalidCategory',
  INVALID_PRIORITY: 'issues.invalidPriority',
  INVALID_LABEL: 'issues.invalidLabel',
  ISSUE_NOT_FOUND: 'issues.notFound',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;

/** Sends one change to the server, through the call it needs. */
function send(key: string, edit: IssueEdit): Promise<void> {
  switch (edit.field) {
    case 'title':
      return Issues.update(key, { title: edit.title });
    case 'description':
      return Issues.update(key, { description: edit.description });
    case 'category':
      return Issues.update(key, { categoryId: edit.category.id });
    case 'priority':
      return Issues.update(key, { priorityId: edit.priority.id });
    case 'status':
      return Issues.changeStatus(key, edit.status.id);
    case 'assignee':
      return Issues.assign(key, edit.assignee?.id ?? null);
    case 'labels':
      return Issues.setLabels(
        key,
        edit.labels.map(({ id }) => id),
      );
    case 'property':
      return Issues.setProperty(key, edit.property.id, edit.option?.id ?? null);
  }
}

/**
 * An issue's page: what was asked, its fields and its history. Every change shows at once and
 * rolls back, with the reason, when the server refuses it. Reports the deletion.
 */
export function IssueView({
  issue,
  replyTo,
  onDeleted,
}: {
  issue: IssueResponse;
  /** Whom comments answer: the reporter, unless it is the reader. */
  replyTo: UserRef | null;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fields = useQuery(IssuesQueries.fields(issue.project.key));
  const [failure, setFailure] = useState<unknown>(null);
  const detail = IssuesQueries.detail(issue.key).queryKey;

  const edit = useMutation({
    mutationFn: (change: IssueEdit) => send(issue.key, change),
    onMutate: async (change) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: detail });
      const previous = queryClient.getQueryData(detail);
      queryClient.setQueryData(detail, (current) =>
        current ? applyEdit(current, change) : current,
      );
      return previous;
    },
    onError: (error, _change, previous) => {
      setFailure(error);
      if (previous) {
        queryClient.setQueryData(detail, previous);
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: detail }),
        queryClient.invalidateQueries({ queryKey: ['issues', 'activities', issue.key] }),
        queryClient.invalidateQueries({ queryKey: IssuesQueries.allOf(issue.project.key) }),
      ]),
  });

  return (
    <div className="flex flex-col gap-6">
      {failure ? (
        <Alert tone="danger">{requestErrorMessage(failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      <IssueHeader
        issue={issue}
        fields={fields.data}
        onEdit={(change) => edit.mutate(change)}
        onDeleted={onDeleted}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <IssueRequest issue={issue} onEdit={(change) => edit.mutate(change)} />
          <IssueHistory
            issueKey={issue.key}
            canComment={issue.actions.includes('comment')}
            replyTo={replyTo}
            statuses={fields.data?.statuses ?? []}
          />
        </div>
        <IssueProperties
          issue={issue}
          fields={fields.data}
          onEdit={(change) => edit.mutate(change)}
        />
      </div>
    </div>
  );
}
