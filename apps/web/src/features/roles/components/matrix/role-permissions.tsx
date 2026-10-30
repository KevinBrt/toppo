import { cn } from '@toppo-tracker/ui';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PermissionControl } from './permission-control.tsx';
import { RoleHeading } from './role-heading.tsx';
import type { MatrixProps } from './roles-matrix.tsx';
import { RowLabel, rowKey, sectionKey, sectionText } from './row-label.tsx';

/** The matrix for small screens: one role at a time, chosen with tabs that scroll sideways. */
export function RolePermissions({ roles, matrix, settingsOf, onChange }: MatrixProps) {
  const { t, locale } = useI18n();
  const [chosenId, setChosenId] = useState<string>();
  const role = roles.find((candidate) => candidate.id === chosenId) ?? roles[0];

  if (!role) {
    return null;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      {/* min-w-0: a fieldset otherwise refuses to shrink, and the tabs could not scroll. */}
      <fieldset className="flex min-w-0 gap-5 overflow-x-auto border-b border-border px-4">
        <legend className="sr-only">{t('roles.shownRole')}</legend>
        {roles.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === role.id}
            onClick={() => setChosenId(candidate.id)}
            className={cn(
              '-mb-px flex min-h-11 shrink-0 items-center border-b-2 text-sm font-medium transition-colors',
              candidate.id === role.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {candidate.name}
          </button>
        ))}
      </fieldset>
      <div className="flex justify-center border-b border-border px-4 py-3">
        <RoleHeading role={role} />
      </div>
      {matrix.sections.map((section) => (
        <section key={sectionKey(section)} aria-labelledby={`role-section-${sectionKey(section)}`}>
          <div className="bg-surface-muted px-4 py-2">
            <h2
              id={`role-section-${sectionKey(section)}`}
              className="text-xs font-semibold text-foreground"
            >
              {sectionText(section, t, locale).title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {sectionText(section, t, locale).detail}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {section.rows.map((row) => (
              <li key={rowKey(row)} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <RowLabel row={row} />
                </div>
                <PermissionControl
                  row={row}
                  role={role}
                  matrix={matrix}
                  settings={settingsOf(role)}
                  onChange={(settings) => onChange(role, settings)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
