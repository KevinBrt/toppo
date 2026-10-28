import type { PaletteColor } from '@toppo-tracker/shared';
import {
  Badge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { FIELD_TRIGGER_CLASS } from './field-menu.tsx';

/** One of the choices: a label, an option of a multi-select. */
export interface Choice {
  id: string;
  name: string;
  color: PaletteColor;
}

/**
 * Several choices of an issue's field, labels or options, chosen in a menu: the menu stays open
 * while one chooses, and the choice is saved once, when it closes, in the order of the options.
 * Disabled, it only shows them.
 */
export function ChoicesField({
  label,
  chosen,
  options,
  none,
  noOptions,
  disabled,
  onChange,
}: {
  /** What the field is, e.g. "Labels": read before the choices. */
  label: string;
  chosen: readonly Choice[];
  options: readonly Choice[];
  /** Shown while nothing is chosen. */
  none: string;
  /** Said in the menu when there is nothing to choose from. */
  noOptions: string;
  disabled: boolean;
  onChange: (chosen: Choice[]) => void;
}) {
  // What the open menu has chosen so far; nothing while it is closed.
  const [picked, setPicked] = useState<string[] | null>(null);
  const badges = (
    <span className="flex min-w-0 flex-wrap gap-1 py-1">
      {chosen.length === 0 ? <span className="text-muted-foreground">{none}</span> : null}
      {chosen.map((choice, index) => (
        <Badge key={choice.id} tone={choice.color} className="h-5 max-w-40 px-2">
          <span className="truncate">
            {choice.name}
            {index < chosen.length - 1 ? <span className="sr-only">,</span> : null}
          </span>
        </Badge>
      ))}
    </span>
  );

  if (disabled) {
    return chosen.length === 0 ? (
      <span className="text-muted-foreground">{none}</span>
    ) : (
      <ul aria-label={label} className="flex min-w-0 flex-wrap gap-1">
        {chosen.map((choice) => (
          <li key={choice.id} className="min-w-0">
            <Badge tone={choice.color} className="h-5 max-w-40 px-2">
              <span className="truncate">{choice.name}</span>
            </Badge>
          </li>
        ))}
      </ul>
    );
  }
  const close = () => {
    if (picked === null) {
      return;
    }
    const before = chosen.map(({ id }) => id);
    const changed = picked.length !== before.length || picked.some((id) => !before.includes(id));
    setPicked(null);
    if (changed) {
      onChange(options.filter(({ id }) => picked.includes(id)));
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => (open ? setPicked(chosen.map(({ id }) => id)) : close())}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={FIELD_TRIGGER_CLASS}>
          {/* Named by what it shows, "Labels, Mobile, Billing", the commas read only. */}
          <span className="sr-only">{label}, </span>
          {badges}
          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={picked?.includes(option.id) ?? false}
            onCheckedChange={(checked) =>
              setPicked((current) => {
                const rest = (current ?? []).filter((id) => id !== option.id);
                return checked ? [...rest, option.id] : rest;
              })
            }
            onSelect={(event) => event.preventDefault()}
          >
            <Badge tone={option.color}>{option.name}</Badge>
          </DropdownMenuCheckboxItem>
        ))}
        {options.length === 0 ? <DropdownMenuItem disabled>{noOptions}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
