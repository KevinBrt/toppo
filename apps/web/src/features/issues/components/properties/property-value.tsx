import type { IssuePropertyValue, Locale } from '@toppo-tracker/shared';
import { Badge } from '@toppo-tracker/ui';
import { formatDay } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatNumber } from '../../../../shared/i18n/numbers.util.ts';
import { PersonName } from '../fields/person-name.tsx';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * A property's value in words: options and people by name, a day and a number as the reader
 * writes them, a box ticked as "Yes".
 */
export function propertyText(value: IssuePropertyValue, t: Translate, locale: Locale): string {
  switch (value.type) {
    case 'list':
      return value.value.name;
    case 'multiSelect':
      return value.value.map(({ name }) => name).join(', ');
    case 'user':
      return value.value.name ?? t('issues.deletedUser');
    case 'number':
      return formatNumber(value.value, locale);
    case 'date':
      return formatDay(value.value, locale);
    case 'checkbox':
      return t('issues.checked');
    case 'text':
      return value.value;
  }
}

/**
 * A property's value beside the issue: options as colored chips, someone with their initials,
 * anything else in words.
 */
export function PropertyValue({ value }: { value: IssuePropertyValue }) {
  const { t, locale } = useI18n();
  switch (value.type) {
    case 'list':
      return (
        <Badge tone={value.value.color} className="max-w-full">
          <span className="truncate">{value.value.name}</span>
        </Badge>
      );
    case 'multiSelect':
      return (
        <ul aria-label={value.name} className="flex min-w-0 flex-wrap gap-1">
          {value.value.map((option) => (
            <li key={option.id} className="min-w-0">
              <Badge tone={option.color} className="h-5 max-w-40 px-2">
                <span className="truncate">{option.name}</span>
              </Badge>
            </li>
          ))}
        </ul>
      );
    case 'user':
      return <PersonName person={value.value} />;
    default:
      return <span className="break-words">{propertyText(value, t, locale)}</span>;
  }
}
