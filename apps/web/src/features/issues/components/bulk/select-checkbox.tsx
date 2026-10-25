import { cn } from '@toppo/ui';

/**
 * A box ticking an issue, or every issue of a page: above the link its row opens, with room for
 * a finger on touch screens. Half ticked when only some of the page are.
 */
export function SelectCheckbox({
  label,
  checked,
  indeterminate = false,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'relative z-10 -m-2 inline-flex cursor-pointer items-center justify-center p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
        className,
      )}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(element) => {
          if (element) {
            element.indeterminate = indeterminate;
          }
        }}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer accent-primary"
      />
    </label>
  );
}
