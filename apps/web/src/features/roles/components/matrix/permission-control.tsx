import { canBeGranted } from '@toppo-tracker/core';
import type { RoleDetails } from '@toppo-tracker/shared';
import { Select, Switch } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import {
  ISSUE_VISIBILITIES,
  issueVisibilityOf,
  type Matrix,
  type MatrixRow,
  type RoleSettings,
  withIssueVisibility,
  withPermission,
} from '../../utils/permission-matrix.util.ts';
import { useRowText } from './row-label.tsx';

/**
 * The control of one row for one role: a switch, or the issue visibility. Permissions are locked
 * for the system role, which has them all, and those only the system role may hold; whether it
 * is told of new issues is not a permission, which any role may change. A plugin's permissions
 * may be given to any role.
 */
export function PermissionControl({
  row,
  role,
  matrix,
  settings,
  onChange,
}: {
  row: MatrixRow;
  role: RoleDetails;
  matrix: Matrix;
  /** What the role grants in the matrix, and whether it is told of new issues, saved or not. */
  settings: RoleSettings;
  onChange: (settings: RoleSettings) => void;
}) {
  const { t } = useI18n();
  const textOf = useRowText();
  const { permissions } = settings;

  if (row.kind === 'notifyNewIssues') {
    return (
      <Switch
        aria-label={t('roles.controlFor', {
          permission: t('roles.notifyNewIssues.label'),
          role: role.name,
        })}
        checked={settings.notifyNewIssues}
        onCheckedChange={(notifyNewIssues) => onChange({ ...settings, notifyNewIssues })}
      />
    );
  }

  if (row.kind === 'issueVisibility') {
    return (
      <Select
        aria-label={t('roles.controlFor', {
          permission: t('roles.visibility.label'),
          role: role.name,
        })}
        value={issueVisibilityOf(permissions)}
        disabled={role.grantsAll}
        onChange={(event) => {
          const visibility = ISSUE_VISIBILITIES.find((option) => option === event.target.value);
          if (visibility) {
            onChange({
              ...settings,
              permissions: withIssueVisibility(permissions, visibility, matrix),
            });
          }
        }}
        className="h-9 min-w-28 pointer-coarse:h-11"
      >
        {ISSUE_VISIBILITIES.map((option) => (
          <option key={option} value={option}>
            {t(`roles.visibility.${option}`)}
          </option>
        ))}
      </Select>
    );
  }

  const { permission } = row;
  const grantable = row.kind === 'pluginPermission' || canBeGranted(row.permission);
  return (
    <Switch
      aria-label={t('roles.controlFor', { permission: textOf(row).label, role: role.name })}
      checked={permissions.includes(permission)}
      disabled={role.grantsAll || !grantable}
      onCheckedChange={(granted) =>
        onChange({
          ...settings,
          permissions: withPermission(permissions, permission, granted, matrix),
        })
      }
    />
  );
}
