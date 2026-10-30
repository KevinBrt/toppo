import { cn } from '@toppo-tracker/ui';
import { PuzzleIcon } from 'lucide-react';

/**
 * A plugin's logo, as Toppo serves it, or a neutral mark when it has none. Its name always
 * stands beside it: the image says nothing more to screen readers.
 */
export function PluginLogo({ url, className }: { url: string | null; className?: string }) {
  if (url === null) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted-foreground',
          className,
        )}
      >
        <PuzzleIcon className="size-1/2" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={cn('shrink-0 rounded-lg border border-border object-contain', className)}
    />
  );
}
