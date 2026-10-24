import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@toppo/ui';
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** A value a filter may keep: as the menu shows it, and its plain name for the button. */
export interface FilterOption {
  value: string;
  label: ReactNode;
  text: string;
}

/** The button opening a filter's menu, standing out while the filter narrows the list. */
export function FilterButton({
  active,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & { active: boolean }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn(
        'max-w-full',
        active &&
          'border-primary bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle',
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      <ChevronDownIcon aria-hidden="true" />
    </Button>
  );
}

/**
 * A filter as a menu: the values to keep, several at once, the menu staying open while one
 * chooses. Its button says what is kept, "Status: New +1", and stands out while it filters.
 */
export function FilterMenu({
  label,
  options,
  chosen,
  loading = false,
  defaultOpen = false,
  onChange,
}: {
  label: string;
  options: readonly FilterOption[];
  chosen: readonly string[];
  /** Options still on their way: said in the menu. */
  loading?: boolean;
  /** Open as it appears: a filter just added. */
  defaultOpen?: boolean;
  onChange: (chosen: string[]) => void;
}) {
  const { t } = useI18n();
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...chosen, value] : chosen.filter((other) => other !== value));

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <FilterButton active={chosen.length > 0}>
          {buttonText(t, label, options, chosen)}
        </FilterButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={chosen.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {loading ? <DropdownMenuItem disabled>{t('issues.list.loading')}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Status", "Status: New", "Status: New +1", or "Assignee: 2" when the names are not at hand. */
function buttonText(
  t: Translate,
  label: string,
  options: readonly FilterOption[],
  chosen: readonly string[],
): string {
  const [first] = chosen;
  if (first === undefined) {
    return label;
  }
  const value = options.find((option) => option.value === first)?.text;
  if (value === undefined) {
    return t('issues.list.chosenCount', { label, count: chosen.length });
  }
  return chosen.length === 1
    ? t('issues.list.chosen', { label, value })
    : t('issues.list.chosenMore', { label, value, count: chosen.length - 1 });
}
