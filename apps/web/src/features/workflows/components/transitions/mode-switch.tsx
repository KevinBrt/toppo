import { WORKFLOW_MODES, type WorkflowMode } from '@toppo-tracker/shared';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** Defined or free: two radio buttons side by side, as one segmented control. */
export function ModeSwitch({
  value,
  disabled,
  onChange,
}: {
  value: WorkflowMode;
  disabled: boolean;
  onChange: (mode: WorkflowMode) => void;
}) {
  const { t } = useI18n();
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label={t('workflow.mode')}
      className="inline-flex shrink-0 self-start rounded-lg bg-surface-muted p-1"
    >
      {WORKFLOW_MODES.map((mode) => (
        <label
          key={mode}
          className="flex min-h-8 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors has-checked:bg-surface has-checked:text-foreground has-checked:shadow-xs has-focus-visible:outline-2 has-focus-visible:outline-ring has-disabled:cursor-default pointer-coarse:min-h-11"
        >
          <input
            type="radio"
            name={name}
            value={mode}
            checked={value === mode}
            disabled={disabled}
            onChange={() => onChange(mode)}
            className="sr-only"
          />
          {t(`workflow.modes.${mode}`)}
        </label>
      ))}
    </div>
  );
}
