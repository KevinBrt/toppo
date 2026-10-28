import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleRequest } from '@toppo-tracker/shared';
import { Button, Dialog, DialogContent, DialogTrigger } from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Roles } from '../../api/roles.api.ts';
import { RolesQueries } from '../../queries/roles.queries.ts';
import { RoleForm } from './role-form.tsx';

/** The "New role" button and its dialog. The role starts without permissions. */
export function NewRole() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: (role: RoleRequest) => Roles.create(role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RolesQueries.all.queryKey });
      setOpen(false);
    },
  });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      create.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" />
          {t('roles.newRole')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('roles.createTitle')}
        description={t('roles.createDescription')}
        closeLabel={t('roles.close')}
      >
        <RoleForm
          submitLabel={t('roles.create')}
          pendingLabel={t('roles.creating')}
          pending={create.isPending}
          error={create.error}
          onSubmit={(role) => create.mutate(role)}
        />
      </DialogContent>
    </Dialog>
  );
}
