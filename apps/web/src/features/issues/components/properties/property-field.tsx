import {
  type IssuePropertyField,
  type IssuePropertyValue,
  PROPERTY_TEXT_MAX_LENGTH,
} from '@toppo/shared';
import { Badge, Switch } from '@toppo/ui';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ChoicesField } from '../fields/choices-field.tsx';
import { FIELD_TRIGGER_CLASS, FieldMenu } from '../fields/field-menu.tsx';
import { PersonField } from './person-field.tsx';
import { PropertyValue } from './property-value.tsx';

/** Stands for no value in the menu of a list: no option has this id. */
const NO_VALUE = 'none';

/** A value typed in place, looking like the other fields until focused. */
const TYPED_CLASS =
  '-mx-2 min-h-9 w-[calc(100%+1rem)] min-w-0 rounded-md bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground hover:bg-surface-hover focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11';

type TypedType = 'text' | 'number' | 'date';

/** What a typed value holds, as typed: empty for none. */
function typedOf(value: IssuePropertyValue | undefined): string {
  switch (value?.type) {
    case 'text':
    case 'date':
      return value.value;
    case 'number':
      return String(value.value);
    default:
      return '';
  }
}

/**
 * The value what is typed gives, `null` for none, or `undefined` when it is no number: nothing
 * changes then.
 */
function typedValue(
  { id, name }: IssuePropertyField,
  type: TypedType,
  typed: string,
): IssuePropertyValue | null | undefined {
  if (typed === '') {
    return null;
  }
  if (type === 'number') {
    const number = Number(typed);
    return Number.isFinite(number) ? { id, name, type, value: number } : undefined;
  }
  return { id, name, type, value: typed };
}

/**
 * A property of an issue beside it, changed in place as its type asks: an option from a menu,
 * several, a line of text, a number or a day typed and kept once the field is left, someone from
 * the people of the project, a box ticked. Disabled, it only shows the value.
 */
export function PropertyField({
  property,
  value,
  projectKey,
  disabled,
  onChange,
}: {
  property: IssuePropertyField;
  /** Its value on the issue, if it has one. */
  value: IssuePropertyValue | undefined;
  projectKey: string;
  disabled: boolean;
  /** The value as it will read; `null` takes it away. */
  onChange: (value: IssuePropertyValue | null) => void;
}) {
  const { t } = useI18n();
  const { id, name } = property;

  if (disabled) {
    return value ? (
      <PropertyValue value={value} />
    ) : (
      <span className="text-muted-foreground">{t('issues.noValue')}</span>
    );
  }
  switch (property.type) {
    case 'list':
      return <ListField property={property} value={value} onChange={onChange} />;
    case 'multiSelect':
      return (
        <ChoicesField
          label={name}
          chosen={value?.type === 'multiSelect' ? value.value : []}
          options={property.options}
          none={t('issues.noValue')}
          noOptions={t('issues.noOptions')}
          disabled={false}
          onChange={(chosen) =>
            onChange(chosen.length > 0 ? { id, name, type: 'multiSelect', value: chosen } : null)
          }
        />
      );
    case 'text':
    case 'number':
    case 'date': {
      const { type } = property;
      const stored = typedOf(value);
      return (
        <TypedValue
          key={stored}
          label={name}
          type={type}
          stored={stored}
          onKeep={(typed) => {
            const next = typedValue(property, type, typed);
            if (next !== undefined) {
              onChange(next);
            }
          }}
        />
      );
    }
    case 'user':
      return (
        <PersonField
          label={name}
          person={value?.type === 'user' ? value.value : null}
          projectKey={projectKey}
          placeholder={t('issues.noValue')}
          className={FIELD_TRIGGER_CLASS}
          onChoose={(person) => onChange(person ? { id, name, type: 'user', value: person } : null)}
        />
      );
    case 'checkbox':
      return (
        <Switch
          aria-label={name}
          checked={value !== undefined}
          onCheckedChange={(checked) =>
            onChange(checked ? { id, name, type: 'checkbox', value: true } : null)
          }
          className="-ml-1"
        />
      );
  }
}

/** One option of a list, or none, chosen in a menu of its options. */
function ListField({
  property,
  value,
  onChange,
}: {
  property: IssuePropertyField;
  value: IssuePropertyValue | undefined;
  onChange: (value: IssuePropertyValue | null) => void;
}) {
  const { t } = useI18n();
  const { id, name } = property;
  return (
    <FieldMenu
      label={name}
      value={value?.type === 'list' ? value.value.id : NO_VALUE}
      options={[
        {
          value: NO_VALUE,
          text: t('issues.noValue'),
          content: <span className="text-muted-foreground">{t('issues.noValue')}</span>,
        },
        ...property.options.map((option) => ({
          value: option.id,
          text: option.name,
          content: (
            <Badge tone={option.color} className="max-w-full">
              <span className="truncate">{option.name}</span>
            </Badge>
          ),
        })),
      ]}
      onChange={(optionId) => {
        const option = property.options.find((candidate) => candidate.id === optionId);
        onChange(option ? { id, name, type: 'list', value: option } : null);
      }}
    />
  );
}

/**
 * A line of text, a number or a day typed in place: kept once the field is left or Enter is
 * pressed, put back as it was with Escape.
 */
function TypedValue({
  label,
  type,
  stored,
  onKeep,
}: {
  label: string;
  type: TypedType;
  /** What it holds now, as typed: empty for no value. */
  stored: string;
  /** What is typed, trimmed, once it differs from what is stored. */
  onKeep: (typed: string) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState(stored);
  const keep = () => {
    const kept = typed.trim();
    if (kept !== stored) {
      onKeep(kept);
    }
  };

  return (
    <input
      aria-label={label}
      type={type}
      value={typed}
      placeholder={t('issues.noValue')}
      autoComplete="off"
      {...(type === 'text' ? { maxLength: PROPERTY_TEXT_MAX_LENGTH } : {})}
      {...(type === 'number' ? { step: 'any', inputMode: 'decimal' as const } : {})}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={keep}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setTyped(stored);
        }
      }}
      className={TYPED_CLASS}
    />
  );
}
