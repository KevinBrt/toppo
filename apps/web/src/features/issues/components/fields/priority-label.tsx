import type { PriorityLevel } from '@toppo-tracker/shared';
import { PriorityIcon } from '@toppo-tracker/ui';

/** A priority: its bars and its name. */
export function PriorityLabel({ priority }: { priority: { name: string; level: PriorityLevel } }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <PriorityIcon level={priority.level} />
      <span className="truncate">{priority.name}</span>
    </span>
  );
}
