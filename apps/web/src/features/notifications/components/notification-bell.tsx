import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { BellIcon, CheckCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../shared/i18n/plural.util.ts';
import { Notifications } from '../api/notifications.api.ts';
import { NotificationsQueries } from '../queries/notifications.queries.ts';
import { NotificationEntry } from './notification-entry.tsx';

/** More than this many unread show as "9+". */
const COUNT_SHOWN_MAX = 9;

/**
 * The bell of the top bar: how many notifications are unread, and the latest in a menu. Choosing
 * one opens its issue and marks it read; the rest can be marked read at once, or all seen.
 */
export function NotificationBell() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const unread = useQuery(NotificationsQueries.unread);
  // Read when opened only: the count alone is asked for every 30 seconds.
  const latest = useQuery({ ...NotificationsQueries.list(1), enabled: open });
  const read = useMutation({
    mutationFn: Notifications.read,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NotificationsQueries.all }),
  });
  const count = unread.data ?? 0;
  const rows = latest.data?.rows ?? [];

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void queryClient.invalidateQueries({ queryKey: NotificationsQueries.all });
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            count > 0
              ? t(`notifications.bellUnread.${pluralForm(locale, count)}`, { count })
              : t('notifications.title')
          }
          className="relative text-muted-foreground"
        >
          <BellIcon aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground"
            >
              {count > COUNT_SHOWN_MAX ? `${COUNT_SHOWN_MAX}+` : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">{t('notifications.title')}</p>
          {count > 0 ? (
            <DropdownMenuItem
              onSelect={(event) => {
                // Stays open, to see them all read.
                event.preventDefault();
                read.mutate({ all: true });
              }}
              className="h-8 w-auto gap-1.5 px-2 text-xs text-primary"
            >
              <CheckCheckIcon aria-hidden="true" />
              {t('notifications.markAllRead')}
            </DropdownMenuItem>
          ) : null}
        </div>
        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto p-1">
          {rows.map((notification) => (
            <DropdownMenuItem key={notification.id} asChild className="h-auto items-start py-2">
              <Link
                to="/issues/$issueKey"
                params={{ issueKey: notification.issue.key }}
                onClick={() => {
                  if (notification.readAt === null) {
                    read.mutate({ ids: [notification.id] });
                  }
                }}
              >
                <NotificationEntry notification={notification} />
              </Link>
            </DropdownMenuItem>
          ))}
          {latest.isSuccess && rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('notifications.empty')}
            </p>
          ) : null}
          {latest.isPending ? (
            <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('notifications.loading')}
            </p>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem asChild className="justify-center text-sm font-medium text-primary">
            <Link to="/notifications">{t('notifications.seeAll')}</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
