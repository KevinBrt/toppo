import type { PaletteColor } from '@toppo-tracker/shared';
import { cn, initialsOf, toneClassName } from '@toppo-tracker/ui';

/** A project's initials on its color. Decorative: always shown next to the project's name. */
export function ProjectMark({
  name,
  color,
  className,
}: {
  name: string;
  color: PaletteColor;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
        toneClassName(color),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
