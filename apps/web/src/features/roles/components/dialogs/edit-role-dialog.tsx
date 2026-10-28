import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleDetails, RoleRequest } from '@toppo-tracker/shared';
import { Dialog, DialogContent } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Roles } from '../../api/roles.api.ts';
import { RolesQueries } from '../../queries/roles.queries.ts';
import { RoleForm } from './role-form.tsx';

/** Renames a role or changes its color. */
export function EditRoleDialog({
  role,
  open,
  onOpenChange,
  onClosed,
}: {
  role: RoleDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes back once the dialog is closed, e.g. the menu that opened it. */
  onClosed: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (changed: RoleRequest) => Roles.update(role.id, changed),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RolesQueries.all.queryKey });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        update.reset();
      }}
    >
      <DialogContent
        title={t('roles.editTitle', { role: role.name })}
        closeLabel={t('roles.close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <RoleForm
          initial={{ name: role.name, color: role.color }}
          submitLabel={t('roles.update')}
          pendingLabel={t('roles.updating')}
          pending={update.isPending}
          error={update.error}
          onSubmit={(changed) => update.mutate(changed)}
        />
      </DialogContent>
    </Dialog>
  );
}
