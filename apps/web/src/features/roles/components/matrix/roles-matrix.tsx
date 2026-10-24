import type { RoleDetails } from '@toppo/shared';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { MATRIX_SECTIONS, type RoleSettings } from '../../utils/permission-matrix.util.ts';
import { PermissionControl } from './permission-control.tsx';
import { RoleHeading } from './role-heading.tsx';
import { RowLabel, rowKey } from './row-label.tsx';

export interface MatrixProps {
  roles: readonly RoleDetails[];
  /** What each role grants in the matrix, and whether it is told of new issues, saved or not. */
  settingsOf: (role: RoleDetails) => RoleSettings;
  onChange: (role: RoleDetails, settings: RoleSettings) => void;
}

/**
 * Every role side by side, permissions in rows grouped by section, for wide screens. The
 * permission column stays in place while many roles scroll sideways.
 */
export function RolesMatrix({ roles, settingsOf, onChange }: MatrixProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('roles.caption')}</caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-64 bg-surface px-4 py-3 text-left text-xs font-medium text-muted-foreground"
            >
              {t('roles.permission')}
            </th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className="min-w-36 px-2 py-3 font-medium">
                <RoleHeading role={role} />
              </th>
            ))}
          </tr>
        </thead>
        {MATRIX_SECTIONS.map(({ section, scope, rows }) => (
          <tbody
            key={section}
            className="divide-y divide-border border-b border-border last:border-b-0"
          >
            <tr className="bg-surface-muted">
              <th
                scope="colgroup"
                colSpan={roles.length + 1}
                className="px-4 py-2 text-left text-xs font-semibold text-foreground"
              >
                {/* Kept beside the permission column while the roles scroll. */}
                <span className="sticky left-4">
                  {t(`roles.sections.${section}`)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {t(`roles.scope.${scope}`)}
                  </span>
                </span>
              </th>
            </tr>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-normal"
                >
                  <RowLabel row={row} />
                </th>
                {roles.map((role) => (
                  <td key={role.id} className="px-2 py-2 text-center">
                    <PermissionControl
                      row={row}
                      role={role}
                      settings={settingsOf(role)}
                      onChange={(settings) => onChange(role, settings)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
