import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaletteColor, UserRef } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { groupHistory } from '../../utils/issue-history.util.ts';
import { CommentForm } from './comment-form.tsx';
import { CommentItem } from './comment-item.tsx';
import { HistoryItem } from './history-item.tsx';

/**
 * What happened to the issue, newest first, as a timeline: one circle per step on a line, changes
 * made together read as one, comments among them. Whoever may comment does so above it.
 */
export function IssueHistory({
  issueKey,
  canComment,
  replyTo,
  statuses,
}: {
  issueKey: string;
  canComment: boolean;
  replyTo: UserRef | null;
  /** The project's statuses, to show those named in the history in their colors. */
  statuses: readonly { id: string; color: PaletteColor }[];
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const [page, setPage] = useState(1);
  const history = useQuery(IssuesQueries.activities(issueKey, page));
  const statusColors = new Map(statuses.map(({ id, color }) => [id, color]));
  const queryClient = useQueryClient();
  // A comment counts as a change: the issue's last change and the lists move with it.
  const refresh = async () => {
    setPage(1);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['issues', 'activities', issueKey] }),
      queryClient.invalidateQueries({ queryKey: IssuesQueries.detail(issueKey).queryKey }),
      queryClient.invalidateQueries({ queryKey: ['issues', 'list'] }),
    ]);
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {t('issues.history')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('issues.historyOrder')}</p>
      </div>
      {canComment ? (
        <CommentForm issueKey={issueKey} replyTo={replyTo} onCommented={refresh} />
      ) : null}
      {history.isError ? (
        <Alert tone="danger">{requestErrorMessage(history.error, t)}</Alert>
      ) : null}
      {history.data ? (
        <>
          <ol aria-busy={history.isPlaceholderData}>
            {groupHistory(history.data.rows).map((entry) => {
              const [first] = entry.changes;
              return first?.type === 'issue.commented' ? (
                <CommentItem
                  key={entry.id}
                  issueKey={issueKey}
                  activity={first}
                  onChanged={refresh}
                />
              ) : (
                <HistoryItem key={entry.id} entry={entry} statusColors={statusColors} />
              );
            })}
          </ol>
          {history.data.matching > history.data.pageSize ? (
            <Pager
              page={history.data.page}
              pageSize={history.data.pageSize}
              matching={history.data.matching}
              shown={history.data.rows.length}
              label={(count) => t(`issues.historyShown.${pluralForm(locale, count)}`, { count })}
              onPage={setPage}
            />
          ) : null}
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t('issues.historyLoading')}
        </p>
      )}
    </section>
  );
}
