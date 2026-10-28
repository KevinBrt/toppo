import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A field's control as a row: its value where the fixed values of the other rows start, its
 * chevron at the end. The margin lets the hover background go past the text without moving it.
 */
export const FIELD_TRIGGER_CLASS =
  '-mx-2 flex min-h-9 w-[calc(100%+1rem)] min-w-0 items-center justify-between gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-transparent pointer-coarse:min-h-11';

export interface FieldMenuOption {
  value: string;
  /** Read out by screen readers, after the field's name. */
  text: string;
  content: ReactNode;
}

/**
 * A field of an issue shown as its value, opening a menu of the others: a Radix menu, so arrow
 * keys, typeahead and Escape work. Disabled, it only shows the value.
 */
export function FieldMenu({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  /** What the field is, e.g. "Priority": the current value is read after it. */
  label: string;
  value: string;
  options: readonly FieldMenuOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={current ? `${label}, ${current.text}` : label}
          className={FIELD_TRIGGER_CLASS}
        >
          <span className="min-w-0">{current?.content}</span>
          {disabled ? null : (
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => (next === value ? undefined : onChange(next))}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.content}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
