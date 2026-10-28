import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleDetails } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useEffect, useState } from 'react';
import { ApiRequestError } from '../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { UnsavedChangesBar } from '../../../shared/forms/unsaved-changes-bar.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Roles } from '../api/roles.api.ts';
import { RolesQueries } from '../queries/roles.queries.ts';
import {
  changesToSave,
  countChanges,
  type RoleDraft,
  type RoleSettings,
  settingsOfRole,
} from '../utils/permission-matrix.util.ts';
import { RolePermissions } from './matrix/role-permissions.tsx';
import { RolesMatrix } from './matrix/roles-matrix.tsx';

const KNOWN_ERRORS = {
  ROLES_CHANGED: 'roles.rolesChanged',
  ROLE_NOT_FOUND: 'roles.roleNotFound',
  SYSTEM_ROLE_LOCKED: 'roles.systemRoleLocked',
  INVALID_PERMISSIONS: 'roles.invalidPermissions',
} as const;

/**
 * The roles and permissions matrix. Changes stay local until saved, all roles together; a role
 * another administrator changed meanwhile is never overwritten. Reports whether changes are
 * pending, for the screen to keep them from being lost.
 */
export function RolesEditor({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const roles = useQuery(RolesQueries.all);
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({});
  const [outcome, setOutcome] = useState<{ saved: true } | { failure: unknown } | null>(null);

  // A role deleted meanwhile has nothing left to save.
  const current = Object.fromEntries(
    Object.entries(drafts).filter(([roleId]) => roles.data?.some(({ id }) => id === roleId)),
  );
  const pending = countChanges(current);

  useEffect(() => onPendingChange?.(pending > 0), [pending, onPendingChange]);

  const save = useMutation({
    mutationFn: () => Roles.savePermissions(changesToSave(current)),
    onMutate: () => setOutcome(null),
    onSuccess: () => {
      setDrafts({});
      setOutcome({ saved: true });
    },
    onError: (error) => {
      setOutcome({ failure: error });
      // Someone else's changes come first: show them, and let the administrator start again.
      if (error instanceof ApiRequestError && error.code === 'ROLES_CHANGED') {
        setDrafts({});
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: RolesQueries.all.queryKey }),
  });

  if (roles.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('roles.loading')}
      </p>
    );
  }
  if (roles.isError) {
    return <Alert tone="danger">{requestErrorMessage(roles.error, t)}</Alert>;
  }

  const settingsOf = (role: RoleDetails) => current[role.id]?.to ?? settingsOfRole(role);
  const change = (role: RoleDetails, settings: RoleSettings) => {
    setOutcome(null);
    setDrafts((previous) => ({
      ...previous,
      [role.id]: { from: previous[role.id]?.from ?? settingsOfRole(role), to: settings },
    }));
  };
  const matrix = { roles: roles.data, settingsOf, onChange: change };

  return (
    <div className="flex flex-col gap-4">
      {outcome && 'failure' in outcome ? (
        <Alert tone="danger">{requestErrorMessage(outcome.failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      {outcome && 'saved' in outcome ? <Alert>{t('roles.saved')}</Alert> : null}
      <div className="hidden md:block">
        <RolesMatrix {...matrix} />
      </div>
      <div className="md:hidden">
        <RolePermissions {...matrix} />
      </div>
      {pending > 0 ? (
        <UnsavedChangesBar
          count={pending}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => setDrafts({})}
        />
      ) : null}
    </div>
  );
}
