import type { RoleDetails } from '@toppo-tracker/shared';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { EllipsisVerticalIcon, LockIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { DeleteRoleDialog } from '../dialogs/delete-role-dialog.tsx';
import { EditRoleDialog } from '../dialogs/edit-role-dialog.tsx';

/**
 * A role's badge, how many members have it, and its ⋮ menu: edit or delete. The system role
 * shows a lock instead, explained to screen readers.
 */
export function RoleHeading({ role }: { role: RoleDetails }) {
  const { t, locale } = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const changeOpen = (kind: 'edit' | 'delete') => (open: boolean) => setDialog(open ? kind : null);

  return (
    <div className="flex items-center justify-center gap-1">
      <div className="flex min-w-0 flex-col items-center gap-1">
        <Badge tone={role.color} className="max-w-full">
          <span className="truncate">{role.name}</span>
        </Badge>
        <span className="text-xs font-normal text-muted-foreground">
          {t(`roles.memberCount.${pluralForm(locale, role.memberCount)}`, {
            count: role.memberCount,
          })}
        </span>
      </div>
      {role.grantsAll ? (
        <span title={t('roles.systemRole')} className="p-2 text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('roles.systemRole')}</span>
        </span>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={trigger}
                variant="ghost"
                size="icon"
                aria-label={t('roles.actionsFor', { role: role.name })}
              >
                <EllipsisVerticalIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              // A dialog takes the focus next; the menu must not take it back.
              onCloseAutoFocus={(event) => (dialog ? event.preventDefault() : undefined)}
            >
              <DropdownMenuItem onSelect={() => setDialog('edit')}>
                <PencilIcon aria-hidden="true" />
                {t('roles.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => setDialog('delete')}>
                <Trash2Icon aria-hidden="true" />
                {t('roles.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <EditRoleDialog
            role={role}
            open={dialog === 'edit'}
            onOpenChange={changeOpen('edit')}
            onClosed={() => trigger.current?.focus()}
          />
          <DeleteRoleDialog
            role={role}
            open={dialog === 'delete'}
            onOpenChange={changeOpen('delete')}
            onClosed={() => trigger.current?.focus()}
          />
        </>
      )}
    </div>
  );
}
