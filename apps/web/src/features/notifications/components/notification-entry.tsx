import type { Notification } from '@toppo/shared';
import { cn } from '@toppo/ui';
import { formatRelativeTime } from '../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';

/** "Sarah assigned you TK-1046", the issue's title under it, and how long ago; unread ones marked. */
export function NotificationEntry({ notification }: { notification: Notification }) {
  const { t, locale } = useI18n();
  const name = notification.actor.name ?? t('issues.deletedUser');
  const key = notification.issue.key;
  const sentence =
    notification.event === 'statusChanged'
      ? t('notifications.events.statusChanged', { name, key, status: notification.status ?? '' })
      : t(`notifications.events.${notification.event}`, { name, key });
  const unread = notification.readAt === null;

  return (
    <span className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm text-foreground', unread && 'font-medium')}>
          {unread ? <span className="sr-only">{t('notifications.unread')} </span> : null}
          {sentence}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {notification.issue.title}
        </span>
        <time dateTime={notification.createdAt} className="block text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt, locale)}
        </time>
      </span>
    </span>
  );
}
