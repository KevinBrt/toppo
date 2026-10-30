import * as Dialog from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn.util.ts';
import { Button } from '../button.tsx';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export interface SheetContentProps extends ComponentProps<typeof Dialog.Content> {
  /** Accessible name of the panel, announced by screen readers. Visually hidden. */
  title: string;
  /** Accessible label of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * A panel sliding in from the left edge, used for the navigation drawer on small screens.
 * Focus is trapped inside while open and restored to the trigger on close (Radix Dialog).
 */
export function SheetContent({
  title,
  closeLabel,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface text-foreground shadow-lg outline-none',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
          'data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
          className,
        )}
        {...props}
      >
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        {children}
        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            className="absolute top-3 right-3 text-current opacity-70 hover:bg-current/10 hover:text-current hover:opacity-100"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
