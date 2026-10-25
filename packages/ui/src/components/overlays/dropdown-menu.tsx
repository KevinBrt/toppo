import * as Menu from '@radix-ui/react-dropdown-menu';
import { CheckIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn.util.ts';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

/**
 * The list of actions a menu opens. Radix handles focus, arrow keys, typeahead and Escape, and
 * gives focus back to the trigger on close.
 */
export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 text-sm text-foreground shadow-lg',
          'data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const ITEM_CLASS = cn(
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 outline-none select-none pointer-coarse:min-h-11',
  'data-highlighted:bg-surface-hover data-disabled:pointer-events-none data-disabled:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0',
);

export function DropdownMenuItem({
  className,
  tone = 'default',
  ...props
}: ComponentProps<typeof Menu.Item> & { tone?: 'default' | 'danger' }) {
  return (
    <Menu.Item
      className={cn(ITEM_CLASS, tone === 'danger' && 'text-danger', className)}
      {...props}
    />
  );
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

/** One choice among several; the chosen one carries a check mark. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(ITEM_CLASS, 'justify-between', className)} {...props}>
      {children}
      <Menu.ItemIndicator>
        <CheckIcon aria-hidden="true" className="text-primary" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

/** One choice among those that go together; each chosen one carries a check mark. */
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(ITEM_CLASS, 'justify-between', className)} {...props}>
      {children}
      <Menu.ItemIndicator>
        <CheckIcon aria-hidden="true" className="text-primary" />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

/** A heading over the items that follow it, not itself a choice. */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn('px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}
