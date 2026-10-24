import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, Button, EmptyState } from '@toppo/ui';
import { BellIcon, CheckCheckIcon } from 'lucide-react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../shared/layout/pager.tsx';
import { Notifications } from '../api/notifications.api.ts';
import { NotificationsQueries } from '../queries/notifications.queries.ts';
import { NotificationEntry } from './notification-entry.tsx';

/**
 * Every notification, page by page, the latest first: each opens its issue and is then read;
 * all can be marked read at once.
 */
export function NotificationsList({
  page,
  onPage,
}: {
  page: number;
  onPage: (page: number) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const list = useQuery(NotificationsQueries.list(page));
  const read = useMutation({
    mutationFn: Notifications.read,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NotificationsQueries.all }),
  });
  const rows = list.data?.rows ?? [];

  if (list.isError) {
    return <Alert tone="danger">{requestErrorMessage(list.error, t)}</Alert>;
  }
  if (list.isSuccess && list.data.matching === 0) {
    return (
      <EmptyState
        icon={BellIcon}
        title={t('notifications.empty')}
        description={t('notifications.emptyDescription')}
      />
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          disabled={!rows.some(({ readAt }) => readAt === null) || read.isPending}
          onClick={() => read.mutate({ all: true })}
        >
          <CheckCheckIcon aria-hidden="true" />
          {t('notifications.markAllRead')}
        </Button>
      </div>
      <ul
        aria-busy={list.isPlaceholderData}
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
      >
        {rows.map((notification) => (
          <li key={notification.id}>
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: notification.issue.key }}
              onClick={() => {
                if (notification.readAt === null) {
                  read.mutate({ ids: [notification.id] });
                }
              }}
              className="block px-4 py-3 transition-colors outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <NotificationEntry notification={notification} />
            </Link>
          </li>
        ))}
      </ul>
      {list.data && list.data.matching > list.data.pageSize ? (
        <Pager
          page={list.data.page}
          pageSize={list.data.pageSize}
          matching={list.data.matching}
          shown={rows.length}
          label={(count) => t(`notifications.shown.${pluralForm(locale, count)}`, { count })}
          onPage={onPage}
        />
      ) : null}
    </section>
  );
}
