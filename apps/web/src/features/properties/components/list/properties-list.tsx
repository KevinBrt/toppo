import {
  type CategoryRow,
  hasOptions,
  type LabelRow,
  type PriorityRow,
  type PropertyRow,
} from '@toppo-tracker/shared';
import { Button } from '@toppo-tracker/ui';
import { ChevronRightIcon, ListIcon, type LucideIcon, PlusIcon, TagsIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { PROPERTY_TYPE_ICONS } from '../../constants/property-types.constants.ts';

export type BuiltInProperty = 'priority' | 'category' | 'labels';

/** A line of the list: one of the built-in fields, or a property an admin added, by its id. */
type ListedProperty = BuiltInProperty | { id: string };

/**
 * The properties of the whole organization, each opening its panel: Priority and Category, two
 * lists of options every project uses, the labels, then the properties admins add (Version,
 * Team…), and the way to add one.
 */
export function PropertiesList({
  categories,
  priorities,
  labels,
  properties,
  onEdit,
  onCreate,
}: {
  categories: readonly CategoryRow[];
  priorities: readonly PriorityRow[];
  labels: readonly LabelRow[];
  properties: readonly PropertyRow[];
  onEdit: (property: ListedProperty) => void;
  onCreate: () => void;
}) {
  const { t, locale } = useI18n();
  const summaryOf = (options: readonly string[]) =>
    options.length === 0
      ? t('properties.noLabels')
      : t('properties.summary', {
          options: t(`properties.options.${pluralForm(locale, options.length)}`, {
            count: options.length,
          }),
          names: options.join(', '),
        });
  const rows: {
    property: ListedProperty;
    name: string;
    type: string;
    icon: LucideIcon;
    summary: string;
  }[] = [
    {
      property: 'priority',
      name: t('properties.priority'),
      type: t('properties.optionList'),
      icon: ListIcon,
      // The highest level first, as people rank them.
      summary: summaryOf(priorities.toReversed().map(({ name }) => name)),
    },
    {
      property: 'category',
      name: t('properties.category'),
      type: t('properties.optionList'),
      icon: ListIcon,
      summary: summaryOf(categories.map(({ name }) => name)),
    },
    {
      property: 'labels',
      name: t('properties.labels'),
      type: t('properties.labelList'),
      icon: TagsIcon,
      summary: summaryOf(labels.map(({ name }) => name)),
    },
    ...properties.map(({ id, name, type, options }) => ({
      property: { id },
      name,
      type: t(`properties.types.${type}`),
      icon: PROPERTY_TYPE_ICONS[type],
      summary: hasOptions(type)
        ? summaryOf(options.map((option) => option.name))
        : t(`properties.typeHelps.${type}`),
    })),
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <h2>
          <span className="font-medium text-foreground">{t('properties.global')}</span>
          {' · '}
          {t('properties.globalHint')}
        </h2>
        <span aria-hidden="true" className="hidden w-40 sm:block">
          {t('properties.type')}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map(({ property, name, type, icon: Icon, summary }) => (
          <li key={typeof property === 'string' ? property : property.id}>
            <button
              type="button"
              onClick={() => onEdit(property)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted-foreground"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{summary}</span>
              </span>
              <span className="hidden w-40 shrink-0 text-sm text-foreground sm:block">{type}</span>
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <PlusIcon aria-hidden="true" />
          {t('properties.newProperty')}
        </Button>
      </div>
    </section>
  );
}
