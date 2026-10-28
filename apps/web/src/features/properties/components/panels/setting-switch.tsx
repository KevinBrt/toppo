import { Switch } from '@toppo-tracker/ui';
import { useId } from 'react';

/** One setting of the property: what it does, a line of help, and its switch. */
export function SettingSwitch({
  label,
  help,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const labelId = useId();
  const helpId = useId();
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </p>
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={helpId}
        onCheckedChange={onChange}
      />
    </div>
  );
}
