import * as Dialog from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn.util.ts';
import { Button } from '../button.tsx';

export const SidePanel = Dialog.Root;
export const SidePanelTrigger = Dialog.Trigger;
export const SidePanelClose = Dialog.Close;

export interface SidePanelContentProps extends ComponentProps<typeof Dialog.Content> {
  title: string;
  /** A sentence under the title, read by screen readers when the panel opens. */
  description?: string;
  /** Accessible label of the close button. */
  closeLabel: string;
  /** Kept in view under the content, which scrolls: the panel's buttons. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A panel sliding in from the right edge to edit one thing beside the page, the whole screen on
 * phones. Focus stays inside while it is open and returns to the trigger on close (Radix Dialog).
 */
export function SidePanelContent({
  title,
  description,
  closeLabel,
  footer,
  className,
  children,
  ...props
}: SidePanelContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface text-foreground shadow-lg outline-none sm:max-w-lg',
          'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]',
          'data-[state=closed]:animate-panel-out data-[state=open]:animate-panel-in',
          className,
        )}
        {...props}
      >
        <div className="border-b border-border px-5 py-4 pr-14 sm:px-6">
          <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </Dialog.Description>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            className="absolute top-3 right-3 mt-[env(safe-area-inset-top)]"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
