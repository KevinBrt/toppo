import { useQuery } from '@tanstack/react-query';
import type { IssuePropertyField, PropertyFilter } from '@toppo-tracker/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
} from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { formatDay } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatNumber } from '../../../../shared/i18n/numbers.util.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { ChoiceMenu } from './choice-menu.tsx';
import { FilterButton, FilterMenu, type FilterOption } from './filter-menu.tsx';

type Change = (filter: PropertyFilter | null) => void;

/**
 * The filters on the project's properties, in the row of the others: one per property filtered,
 * or just added from the « + Property » menu, which offers the others and opens the one chosen.
 * Options, people and boxes are chosen in a menu; numbers and days as a range in a dialog. A line
 * of text is never offered, nor searched: the search reads titles and descriptions only.
 */
export function PropertyFilters({
  projectKey,
  filters,
  canListPeople,
  onChange,
}: {
  projectKey: string;
  filters: readonly PropertyFilter[];
  /** Whoever may assign issues gets the people of the project in a person property's filter. */
  canListPeople: boolean;
  onChange: (propertyId: string, filter: PropertyFilter | null) => void;
}) {
  const { t } = useI18n();
  const fields = useQuery(IssuesQueries.fields(projectKey));
  // Added from the menu, filtering nothing yet; the last one added opens at once.
  const [added, setAdded] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const filterable = (fields.data?.properties ?? []).filter(({ type }) => type !== 'text');
  const isShown = ({ id }: IssuePropertyField) =>
    added.includes(id) || filters.some(({ propertyId }) => propertyId === id);
  const offered = filterable.filter((property) => !isShown(property));

  return (
    <>
      {filterable.filter(isShown).map((property) => (
        <PropertyFilterControl
          key={property.id}
          projectKey={projectKey}
          property={property}
          filter={filters.find(({ propertyId }) => propertyId === property.id)}
          canListPeople={canListPeople}
          opening={opening === property.id}
          onChange={(filter) => onChange(property.id, filter)}
        />
      ))}
      {offered.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <PlusIcon aria-hidden="true" />
              <span className="sr-only">{t('issues.list.filterBy')} </span>
              {t('issues.list.property')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 overflow-y-auto"
            // The filter chosen opens and takes the focus: it does not go back to this button.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {offered.map((property) => (
              <DropdownMenuItem
                key={property.id}
                onSelect={() => {
                  setAdded([...added, property.id]);
                  setOpening(property.id);
                }}
              >
                {property.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

/** The filter of one property, as its type asks. */
function PropertyFilterControl({
  projectKey,
  property,
  filter,
  canListPeople,
  opening,
  onChange,
}: {
  projectKey: string;
  property: IssuePropertyField;
  filter: PropertyFilter | undefined;
  canListPeople: boolean;
  /** Just added: open at once. */
  opening: boolean;
  onChange: Change;
}) {
  const { t } = useI18n();
  const people = useQuery({
    ...IssuesQueries.assignees(projectKey, ''),
    enabled: canListPeople && property.type === 'user',
  });
  const chosen = filter && 'values' in filter ? filter.values : [];
  const choose = (values: string[]) =>
    onChange(values.length > 0 ? { propertyId: property.id, values } : null);
  const none: FilterOption = {
    value: 'none',
    label: <span className="text-muted-foreground">{t('issues.noValue')}</span>,
    text: t('issues.noValue'),
  };

  switch (property.type) {
    case 'list':
    case 'multiSelect':
      return (
        <FilterMenu
          label={property.name}
          options={[
            ...property.options.map((option) => ({
              value: option.id,
              label: <Badge tone={option.color}>{option.name}</Badge>,
              text: option.name,
            })),
            none,
          ]}
          chosen={chosen}
          defaultOpen={opening}
          onChange={choose}
        />
      );
    case 'user':
      return (
        <FilterMenu
          label={property.name}
          options={[
            { value: 'me', label: t('issues.list.me'), text: t('issues.list.me') },
            none,
            ...(people.data ?? []).map(({ id, name }) => ({ value: id, label: name, text: name })),
          ]}
          chosen={chosen}
          loading={canListPeople && people.isPending}
          defaultOpen={opening}
          onChange={choose}
        />
      );
    case 'checkbox':
      return (
        <TickedFilter property={property} chosen={chosen} opening={opening} onChange={choose} />
      );
    case 'number':
    case 'date':
      return (
        <RangeFilter
          property={property}
          type={property.type}
          range={filter && 'from' in filter ? filter : null}
          opening={opening}
          onChange={onChange}
        />
      );
    case 'text':
      return null;
  }
}

/** A box ticked, not ticked, or either. */
function TickedFilter({
  property,
  chosen,
  opening,
  onChange,
}: {
  property: IssuePropertyField;
  chosen: readonly string[];
  opening: boolean;
  onChange: (values: string[]) => void;
}) {
  const { t } = useI18n();
  const value = chosen[0] === 'yes' || chosen[0] === 'no' ? chosen[0] : 'any';
  return (
    <ChoiceMenu
      trigger={
        <FilterButton active={value !== 'any'}>
          {value === 'any'
            ? property.name
            : t('issues.list.chosen', {
                label: property.name,
                value: t(`issues.list.ticked.${value}`),
              })}
        </FilterButton>
      }
      value={value}
      options={(['any', 'yes', 'no'] as const).map((answer) => ({
        value: answer,
        label: t(`issues.list.ticked.${answer}`),
      }))}
      defaultOpen={opening}
      onChange={(answer) => onChange(answer === 'any' ? [] : [answer])}
    />
  );
}

/** Numbers or days within a range, open on one side, chosen in a dialog. */
function RangeFilter({
  property,
  type,
  range,
  opening,
  onChange,
}: {
  property: IssuePropertyField;
  type: 'number' | 'date';
  range: Extract<PropertyFilter, { from: string | null }> | null;
  opening: boolean;
  onChange: Change;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(opening);
  const shown = (end: string) =>
    type === 'date' ? formatDay(end, locale) : formatNumber(Number(end), locale);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <FilterButton active={range !== null}>
          {range
            ? t('issues.list.chosen', {
                label: property.name,
                value: rangeText(range, shown, t),
              })
            : property.name}
        </FilterButton>
      </DialogTrigger>
      <DialogContent
        title={t('issues.list.rangeTitle', { name: property.name })}
        closeLabel={t('issues.close')}
      >
        <RangeForm
          type={type}
          range={range}
          onDone={(ends) => {
            setOpen(false);
            onChange(ends ? { propertyId: property.id, ...ends } : null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** "Nov 2 – Dec 1", "≥ 3", "≤ Dec 1": a range as its button says it. */
function rangeText(
  { from, to }: { from: string | null; to: string | null },
  shown: (end: string) => string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (from !== null && to !== null) {
    return t('issues.list.rangeBoth', { from: shown(from), to: shown(to) });
  }
  return from !== null
    ? t('issues.list.rangeFrom', { from: shown(from) })
    : t('issues.list.rangeTo', { to: shown(to ?? '') });
}

/** The two ends of a range, either left empty; both empty take the filter away. */
function RangeForm({
  type,
  range,
  onDone,
}: {
  type: 'number' | 'date';
  range: { from: string | null; to: string | null } | null;
  onDone: (ends: { from: string | null; to: string | null } | null) => void;
}) {
  const { t } = useI18n();
  const [from, setFrom] = useState(range?.from ?? '');
  const [to, setTo] = useState(range?.to ?? '');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onDone(from || to ? { from: from || null, to: to || null } : null);
  };
  const end = (label: string, value: string, set: (value: string) => void) => (
    <Field label={label}>
      {(control) => (
        <Input
          {...control}
          type={type}
          value={value}
          {...(type === 'number' ? { step: 'any', inputMode: 'decimal' as const } : {})}
          onChange={(event) => set(event.target.value)}
        />
      )}
    </Field>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {end(t('issues.list.from'), from, setFrom)}
        {end(t('issues.list.to'), to, setTo)}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => onDone(null)}>
          {t('issues.list.clearRange')}
        </Button>
        <Button type="submit">{t('issues.list.apply')}</Button>
      </div>
    </form>
  );
}
