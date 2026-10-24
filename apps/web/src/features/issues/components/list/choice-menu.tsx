import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@toppo/ui';
import type { ReactElement } from 'react';

/** One of a few choices, as a menu: the issues to show by their state, or how to group them. */
export function ChoiceMenu<Value extends string>({
  trigger,
  value,
  options,
  defaultOpen = false,
  onChange,
}: {
  /** The button opening the menu, saying what is chosen. */
  trigger: ReactElement;
  value: Value;
  options: readonly { value: Value; label: string }[];
  /** Open as it appears: a filter just added. */
  defaultOpen?: boolean;
  onChange: (value: Value) => void;
}) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(chosen) => {
            const option = options.find((candidate) => candidate.value === chosen);
            if (option) {
              onChange(option.value);
            }
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
