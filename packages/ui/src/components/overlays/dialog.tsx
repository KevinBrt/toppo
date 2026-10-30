import * as RadixDialog from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn.util.ts';
import { Button } from '../button.tsx';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends ComponentProps<typeof RadixDialog.Content> {
  title: string;
  /** A sentence under the title, read by screen readers when the dialog opens. */
  description?: string;
  /** Accessible label of the close button. */
  closeLabel: string;
  /** For a dialog whose content says what it is, e.g. a search box: the title is read only. */
  hideTitle?: boolean;
  children: ReactNode;
}

/**
 * A centered modal dialog. Focus stays inside while it is open and returns to the trigger on
 * close; Escape and the close button close it (Radix Dialog). Scrolls inside on small screens.
 */
export function DialogContent({
  title,
  description,
  closeLabel,
  hideTitle = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      {/* On the layer of the dialog, before it: one opened over another darkens that one too. */}
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
          'rounded-xl border border-border bg-surface p-5 text-foreground shadow-lg outline-none sm:p-6',
          'data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      >
        <RadixDialog.Title
          className={hideTitle ? 'sr-only' : 'pr-10 text-lg font-semibold tracking-tight'}
        >
          {title}
        </RadixDialog.Title>
        {description ? (
          <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </RadixDialog.Description>
        ) : null}
        <div className={hideTitle ? undefined : 'mt-5'}>{children}</div>
        <RadixDialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            className="absolute top-3 right-3"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
