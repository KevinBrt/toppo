import { useMutation } from '@tanstack/react-query';
import { NOTIFICATION_EVENTS, type NotificationEvent } from '@toppo/shared';
import { Alert, Switch } from '@toppo/ui';
import { useId } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Account } from '../api/account.api.ts';

const EVENT_LABELS = {
  created: 'account.emailEvents.created',
  assigned: 'account.emailEvents.assigned',
  commented: 'account.emailEvents.commented',
  mentioned: 'account.emailEvents.mentioned',
  statusChanged: 'account.emailEvents.statusChanged',
} as const satisfies Record<NotificationEvent, string>;

/**
 * Which kinds of one's notifications are emailed too, each switched on or off at once. Reports
 * each change; says so when email is not set up, as nothing leaves then.
 */
export function EmailNotificationsSetting({
  emailed,
  emailSetUp,
  onChanged,
}: {
  emailed: readonly NotificationEvent[];
  /** Whether the instance sends email at all; unknown while it loads. */
  emailSetUp: boolean | undefined;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const change = useMutation({
    mutationFn: (next: readonly NotificationEvent[]) => Account.setEmailNotifications(next),
    onSuccess: onChanged,
  });
  // The switches move at once; they move back if the server refuses.
  const shown = change.isPending ? change.variables : emailed;
  const toggle = (event: NotificationEvent, on: boolean) =>
    change.mutate(
      NOTIFICATION_EVENTS.filter((candidate) =>
        candidate === event ? on : shown.includes(candidate),
      ),
    );

  return (
    <div className="flex flex-col gap-3">
      {change.isError ? <Alert tone="danger">{requestErrorMessage(change.error, t)}</Alert> : null}
      <div>
        <h3 id={titleId} className="text-sm font-medium text-foreground">
          {t('account.emailNotificationsTitle')}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('account.emailNotificationsHelp')}
        </p>
      </div>
      <ul aria-labelledby={titleId} className="divide-y divide-border">
        {NOTIFICATION_EVENTS.map((event) => (
          <EventSwitch
            key={event}
            label={t(EVENT_LABELS[event])}
            help={event === 'created' ? t('account.emailEventsCreatedHelp') : undefined}
            checked={shown.includes(event)}
            disabled={change.isPending}
            onCheckedChange={(on) => toggle(event, on)}
          />
        ))}
      </ul>
      {emailSetUp === false ? (
        <p className="text-sm text-muted-foreground">{t('account.emailNotSetUp')}</p>
      ) : null}
    </div>
  );
}

function EventSwitch({
  label,
  help,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  help: string | undefined;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const labelId = useId();
  const helpId = useId();
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p id={labelId} className="text-sm text-foreground">
          {label}
        </p>
        {help ? (
          <p id={helpId} className="text-xs text-muted-foreground">
            {help}
          </p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        aria-labelledby={labelId}
        {...(help ? { 'aria-describedby': helpId } : {})}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </li>
  );
}
