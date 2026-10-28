import type { UserSummary } from '@toppo-tracker/shared';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import {
  EllipsisVerticalIcon,
  FolderKanbanIcon,
  Trash2Icon,
  UserCheckIcon,
  UserXIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { UserChange } from '../../models/user-change.model.ts';
import { DeleteMemberDialog } from './delete-member-dialog.tsx';
import { MemberProjectsDialog } from './member-projects-dialog.tsx';

/**
 * The ⋮ menu of a member's row: their access to projects, deactivate or reactivate, or delete
 * after confirming.
 */
export function MemberActions({
  member,
  onChange,
}: {
  member: UserSummary;
  onChange: (change: UserChange) => void;
}) {
  const { t } = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingProjects, setEditingProjects] = useState(false);
  const deactivated = member.deactivatedAt !== null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            aria-label={t('members.actionsFor', { name: member.name })}
          >
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          // A dialog takes the focus next; the menu must not take it back.
          onCloseAutoFocus={(event) =>
            confirmingDelete || editingProjects ? event.preventDefault() : undefined
          }
        >
          <DropdownMenuItem onSelect={() => setEditingProjects(true)}>
            <FolderKanbanIcon aria-hidden="true" />
            {t('memberProjects.menu')}
          </DropdownMenuItem>
          {deactivated ? (
            <DropdownMenuItem onSelect={() => onChange({ type: 'reactivate', userId: member.id })}>
              <UserCheckIcon aria-hidden="true" />
              {t('members.reactivate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onChange({ type: 'deactivate', userId: member.id })}>
              <UserXIcon aria-hidden="true" />
              {t('members.deactivate')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" onSelect={() => setConfirmingDelete(true)}>
            <Trash2Icon aria-hidden="true" />
            {t('members.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteMemberDialog
        member={member}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onConfirm={() => onChange({ type: 'delete', userId: member.id })}
        onClosed={() => trigger.current?.focus()}
      />
      <MemberProjectsDialog
        member={member}
        open={editingProjects}
        onOpenChange={setEditingProjects}
        onClosed={() => trigger.current?.focus()}
      />
    </>
  );
}
