import type { Notification } from '@toppo/shared';
import { cn } from '@toppo/ui';
import { formatRelativeTime } from '../../../shared/i18n/dates.util.ts';
import type { Translate } from '../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';

/** What happened, as one sentence: "Sarah assigned you TK-1046". */
function sentenceOf(notification: Notification, t: Translate): string {
  const name = notification.actor.name ?? t('issues.deletedUser');
  const key = notification.issue.key;
  switch (notification.event) {
    case 'statusChanged':
      return t('notifications.events.statusChanged', {
        name,
        key,
        status: notification.status ?? '',
      });
    case 'assigneeChanged':
      return notification.assignee
        ? t('notifications.events.assigneeChanged', {
            name,
            key,
            assignee: notification.assignee.name ?? t('issues.deletedUser'),
          })
        : t('notifications.unassigned', { name, key });
    case 'duplicateChanged':
      if (!notification.original) {
        return t('notifications.unmarkedDuplicate', { name, key });
      }
      return notification.original.key
        ? t('notifications.events.duplicateChanged', {
            name,
            key,
            original: notification.original.key,
          })
        : t('notifications.duplicateHidden', { name, key });
    default:
      return t(`notifications.events.${notification.event}`, { name, key });
  }
}

/** "Sarah assigned you TK-1046", the issue's title under it, and how long ago; unread ones marked. */
export function NotificationEntry({ notification }: { notification: Notification }) {
  const { t, locale } = useI18n();
  const sentence = sentenceOf(notification, t);
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
