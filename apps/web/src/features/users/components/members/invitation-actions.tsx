import type { PendingInvitation } from '@toppo-tracker/shared';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { EllipsisVerticalIcon, LinkIcon, XCircleIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The ⋮ menu of an invitation's row: a new link (the old one dies), or no invitation at all. */
export function InvitationActions({
  invitation,
  onRenew,
  onRevoke,
}: {
  invitation: PendingInvitation;
  onRenew: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('members.actionsFor', { name: invitation.email })}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onRenew(invitation.id)}>
          <LinkIcon aria-hidden="true" />
          {t('invitations.renew')}
        </DropdownMenuItem>
        <DropdownMenuItem tone="danger" onSelect={() => onRevoke(invitation.id)}>
          <XCircleIcon aria-hidden="true" />
          {t('invitations.revoke')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
