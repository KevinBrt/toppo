import { isInvitationExpired } from '@toppo-tracker/core';
import type { PendingInvitation } from '@toppo-tracker/shared';
import { Avatar, Badge, cn } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { InvitationActions } from './invitation-actions.tsx';

interface InvitationRowProps {
  invitation: PendingInvitation;
  now: Date;
  onRenew: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
}

/** Someone invited who has not joined yet, laid out like a member's row. */
export function InvitationRow({ invitation, now, onRenew, onRevoke }: InvitationRowProps) {
  const { t } = useI18n();
  const expired = isInvitationExpired(new Date(invitation.expiresAt), now);

  return (
    <tr>
      <td className="py-3 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={invitation.email}
            className="hidden border border-dashed border-border-strong bg-surface sm:flex"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{invitation.email}</p>
            <p className="truncate text-muted-foreground">
              {invitation.invitedBy === null
                ? t('members.invitedByDeleted')
                : t('members.invitedBy', { name: invitation.invitedBy })}
            </p>
            <InvitationState expired={expired} className="mt-1 md:hidden" />
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <Badge tone={invitation.role.color}>{invitation.role.name}</Badge>
      </td>
      <td className="hidden px-2 py-3 md:table-cell">
        <InvitationState expired={expired} />
      </td>
      <td className="py-3 pr-2 text-right">
        <InvitationActions invitation={invitation} onRenew={onRenew} onRevoke={onRevoke} />
      </td>
    </tr>
  );
}

function InvitationState({ expired, className }: { expired: boolean; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        expired ? 'text-danger' : 'text-warning',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {expired ? t('members.expired') : t('members.invited')}
    </span>
  );
}
