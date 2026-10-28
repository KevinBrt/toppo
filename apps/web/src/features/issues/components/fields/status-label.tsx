import type { PaletteColor } from '@toppo-tracker/shared';
import { cn, swatchClassName } from '@toppo-tracker/ui';

/** A status: its colored dot and its name. */
export function StatusLabel({ status }: { status: { name: string; color: PaletteColor } }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', swatchClassName(status.color))}
      />
      <span className="truncate">{status.name}</span>
    </span>
  );
}
