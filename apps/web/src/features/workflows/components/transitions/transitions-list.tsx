import { StatusBadge } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { WorkflowDraft } from '../../models/workflow-draft.model.ts';
import { allows, exitsOf } from '../../utils/workflow-draft.util.ts';

/** On phones, the grid one status at a time: the statuses an issue may move to from it. */
export function TransitionsList({
  draft,
  disabled,
  onToggle,
}: {
  draft: WorkflowDraft;
  disabled: boolean;
  onToggle: (from: string, to: string) => void;
}) {
  const { t, locale } = useI18n();

  return (
    <ul className="divide-y divide-border">
      {draft.statuses.map((from) => {
        const exits = exitsOf(draft, from.key);
        return (
          <li key={from.key} className="px-4 py-3">
            <fieldset>
              <legend className="mb-2 flex items-center gap-2">
                <StatusBadge status={from} />
                <span className="text-xs text-muted-foreground">
                  {t(`workflow.exits.${pluralForm(locale, exits)}`, { count: exits })}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {draft.statuses
                  .filter(({ key }) => key !== from.key)
                  .map((to) => (
                    <label
                      key={to.key}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-ring"
                    >
                      <input
                        type="checkbox"
                        checked={allows(draft.moves, from.key, to.key)}
                        disabled={disabled}
                        onChange={() => onToggle(from.key, to.key)}
                        className="size-4 accent-primary"
                      />
                      {to.name}
                    </label>
                  ))}
              </div>
            </fieldset>
          </li>
        );
      })}
    </ul>
  );
}
