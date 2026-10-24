import { type IssuePropertyField, PROPERTY_TEXT_MAX_LENGTH, type UserRef } from '@toppo/shared';
import {
  Badge,
  Field,
  type FieldControlProps,
  Input,
  inputClassName,
  Select,
  Switch,
} from '@toppo/ui';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { PropertyDraft } from '../../models/new-issue-form.model.ts';
import { PersonField } from './person-field.tsx';

/** Someone a draft names, if it names anyone. */
const personOf = (draft: PropertyDraft | undefined): UserRef | null =>
  draft !== null && typeof draft === 'object' && 'id' in draft ? draft : null;

/**
 * A property asked when an issue is reported, as its type asks: one option of a list, several as
 * boxes to tick, a line of text, a number, a day, someone of the project, a box. Reports what the
 * field holds; nothing given means no value, unless it is required.
 */
export function PropertyInput({
  property,
  draft,
  error,
  projectKey,
  onChange,
}: {
  property: IssuePropertyField;
  draft: PropertyDraft | undefined;
  error: string | undefined;
  projectKey: string;
  onChange: (draft: PropertyDraft) => void;
}) {
  if (property.type === 'multiSelect') {
    return (
      <ChoiceBoxes
        property={property}
        chosen={Array.isArray(draft) ? draft : []}
        error={error}
        onChange={onChange}
      />
    );
  }
  return (
    <Field label={property.name} required={property.required} error={error}>
      {(control) => (
        <PropertyControl
          property={property}
          control={control}
          draft={draft}
          projectKey={projectKey}
          onChange={onChange}
        />
      )}
    </Field>
  );
}

/** The control of a property's field, labelled by the field. */
function PropertyControl({
  property,
  control,
  draft,
  projectKey,
  onChange,
}: {
  property: IssuePropertyField;
  control: FieldControlProps;
  draft: PropertyDraft | undefined;
  projectKey: string;
  onChange: (draft: PropertyDraft) => void;
}) {
  const { t } = useI18n();
  const typed = typeof draft === 'string' ? draft : '';
  const none = property.required ? t('issues.chooseOption') : t('issues.noValue');
  const describedBy = control['aria-describedby'];

  switch (property.type) {
    case 'list':
    case 'multiSelect':
      return (
        <Select {...control} value={typed} onChange={(event) => onChange(event.target.value)}>
          <option value="">{none}</option>
          {property.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      );
    case 'text':
    case 'number':
    case 'date':
      return (
        <Input
          {...control}
          type={property.type}
          value={typed}
          autoComplete="off"
          {...(property.type === 'text' ? { maxLength: PROPERTY_TEXT_MAX_LENGTH } : {})}
          {...(property.type === 'number' ? { step: 'any', inputMode: 'decimal' as const } : {})}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'user':
      return (
        <PersonField
          label={property.name}
          person={personOf(draft)}
          projectKey={projectKey}
          placeholder={none}
          id={control.id}
          describedBy={describedBy}
          className={inputClassName}
          onChoose={onChange}
        />
      );
    case 'checkbox':
      return (
        <Switch
          id={control.id}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          checked={draft === true}
          onCheckedChange={onChange}
          className="-ml-1 self-start"
        />
      );
  }
}

/** The options of a multi-select as boxes side by side, any of them ticked. */
function ChoiceBoxes({
  property,
  chosen,
  error,
  onChange,
}: {
  property: IssuePropertyField;
  chosen: readonly string[];
  error: string | undefined;
  onChange: (chosen: string[]) => void;
}) {
  const id = useId();
  const toggle = (optionId: string, ticked: boolean) =>
    onChange(
      property.options
        .map((option) => option.id)
        .filter((candidate) => (candidate === optionId ? ticked : chosen.includes(candidate))),
    );

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      {...(error ? { 'aria-describedby': `${id}-error` } : {})}
    >
      <legend className="mb-1.5 text-sm font-medium text-foreground">
        {property.name}
        {property.required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {property.options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 text-sm transition-colors hover:bg-surface-hover has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:min-h-11"
          >
            <input
              type="checkbox"
              checked={chosen.includes(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
              className="size-4 accent-primary"
            />
            <Badge tone={option.color}>{option.name}</Badge>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
