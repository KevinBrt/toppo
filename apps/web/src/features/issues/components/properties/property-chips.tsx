import type { IssuePropertyValue, PaletteColor } from '@toppo/shared';
import { Badge, cn } from '@toppo/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { propertyText } from './property-value.tsx';

/** One chip: an option in its color, read after its property's name, or a value with its name. */
interface Chip {
  key: string;
  property: string;
  tone: PaletteColor;
  text: string;
  /** Whether the property's name is in `text` already. */
  named: boolean;
}

/**
 * The values of an issue's properties as chips: each option in its color, read with its
 * property's name; any other value with that name before it ("Due: Nov 2, 2026"), a box ticked
 * as the name alone.
 */
export function PropertyChips({
  values,
  className,
}: {
  values: readonly IssuePropertyValue[];
  className?: string;
}) {
  const { t, locale } = useI18n();
  if (values.length === 0) {
    return null;
  }
  const chips = values.flatMap((value): Chip[] => {
    switch (value.type) {
      case 'list':
      case 'multiSelect':
        return (value.type === 'list' ? [value.value] : value.value).map((option) => ({
          key: `${value.id}-${option.id}`,
          property: value.name,
          tone: option.color,
          text: option.name,
          named: false,
        }));
      case 'checkbox':
        return [
          { key: value.id, property: value.name, tone: 'gray', text: value.name, named: true },
        ];
      default:
        return [
          {
            key: value.id,
            property: value.name,
            tone: 'gray',
            text: t('issues.propertyChip', {
              name: value.name,
              value: propertyText(value, t, locale),
            }),
            named: true,
          },
        ];
    }
  });

  return (
    <ul
      aria-label={t('issues.properties')}
      className={cn('flex min-w-0 flex-wrap gap-1', className)}
    >
      {chips.map((chip) => (
        <li key={chip.key} className="min-w-0">
          <Badge tone={chip.tone} title={chip.property} className="h-5 max-w-40 px-2">
            {chip.named ? null : (
              <span className="sr-only">
                {t('issues.activity.field', { label: chip.property })}{' '}
              </span>
            )}
            <span className="truncate">{chip.text}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
