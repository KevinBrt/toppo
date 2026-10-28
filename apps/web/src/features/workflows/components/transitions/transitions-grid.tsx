import { cn, StatusBadge, swatchClassName } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { WorkflowDraft } from '../../models/workflow-draft.model.ts';
import { allows, exitsOf } from '../../utils/workflow-draft.util.ts';

/**
 * Every move as a checkbox: a row per status an issue leaves, a column per status it may reach.
 * The row pointed at or focused is the one the summary tells about.
 */
export function TransitionsGrid({
  draft,
  active,
  disabled,
  onActive,
  onToggle,
}: {
  draft: WorkflowDraft;
  active: string | null;
  disabled: boolean;
  onActive: (key: string) => void;
  onToggle: (from: string, to: string) => void;
}) {
  const { t, locale } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th
              scope="col"
              className="px-5 py-3 text-left text-xs font-normal whitespace-nowrap text-muted-foreground"
            >
              {t('workflow.fromTo')}
            </th>
            {draft.statuses.map((status) => (
              <th key={status.key} scope="col" className="px-2 py-3 text-xs font-medium">
                <span className="flex flex-col items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-full', swatchClassName(status.color))}
                  />
                  <span className="text-foreground">{status.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {draft.statuses.map((from) => {
            const exits = exitsOf(draft, from.key);
            return (
              <tr
                key={from.key}
                onMouseEnter={() => onActive(from.key)}
                onFocus={() => onActive(from.key)}
                className={cn(active === from.key && 'bg-surface-hover')}
              >
                <th scope="row" className="px-5 py-2.5 text-left font-normal">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <StatusBadge status={from} />
                    <span className="text-xs text-muted-foreground">
                      {t(`workflow.exits.${pluralForm(locale, exits)}`, { count: exits })}
                    </span>
                  </span>
                </th>
                {draft.statuses.map((to) => (
                  <td key={to.key} className="px-2 py-2.5 text-center">
                    {to.key === from.key ? (
                      <span aria-hidden="true" className="text-border">
                        —
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={t('workflow.move', { from: from.name, to: to.name })}
                        checked={allows(draft.moves, from.key, to.key)}
                        disabled={disabled}
                        onChange={() => onToggle(from.key, to.key)}
                        className="size-4 cursor-pointer accent-primary disabled:cursor-default"
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
