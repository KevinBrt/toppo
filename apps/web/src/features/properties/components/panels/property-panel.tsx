import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPropertyRequestSchema,
  PROPERTY_NAME_MAX_LENGTH,
  PROPERTY_OPTIONS_MAX,
  type PropertyRow,
  updatePropertyRequestSchema,
} from '@toppo/shared';
import {
  Alert,
  Button,
  Field,
  Input,
  SidePanel,
  SidePanelClose,
  SidePanelContent,
  SortableList,
} from '@toppo/ui';
import { Trash2Icon } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { sortableMessages } from '../../../../shared/forms/sortable-messages.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { ProjectProperties } from '../../api/project-properties.api.ts';
import { Properties } from '../../api/properties.api.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import { PropertiesQueries } from '../../queries/properties.queries.ts';
import {
  type NameProblem,
  nameProblemsOf,
  newOptionKey,
  nextColor,
} from '../../utils/option-drafts.util.ts';
import { AddOption } from '../options/add-option.tsx';
import { CategoryOption } from '../options/category-option.tsx';
import { OptionsSection } from '../options/options-section.tsx';
import { DeletePropertyDialog } from './delete-property-dialog.tsx';
import { SettingSwitch } from './setting-switch.tsx';

const KNOWN_ERRORS = {
  PROPERTY_CHANGED: 'properties.changed',
  PROPERTY_NAME_TAKEN: 'properties.propertyNameTaken',
  OPTION_NAME_TAKEN: 'properties.nameTaken',
  PROPERTY_LIMIT_REACHED: 'properties.limitReached',
  PROPERTY_NOT_FOUND: 'properties.propertyGone',
} as const;

/**
 * A property of the instance, or of one project, edited beside the page, or a new one: its name,
 * its options, where it shows and whether it is asked at creation, saved at once. Reports the
 * save, or the deletion.
 */
export function PropertyPanel({
  open,
  onOpenChange,
  property,
  projectKey,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` for a new property. */
  property: PropertyRow | null;
  /** The project it belongs to; none for one of the instance. */
  projectKey?: string | undefined;
  onSaved: () => Promise<void> | void;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      {/* Mounted while open only: each opening starts again from what is saved. */}
      {open ? (
        <PropertyEditor property={property} projectKey={projectKey} onSaved={onSaved} />
      ) : null}
    </SidePanel>
  );
}

interface Settings {
  shownInList: boolean;
  askedAtCreation: boolean;
  required: boolean;
}

function PropertyEditor({
  property,
  projectKey,
  onSaved,
}: {
  property: PropertyRow | null;
  projectKey: string | undefined;
  onSaved: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const formId = useId();
  const [name, setName] = useState(property?.name ?? '');
  const [settings, setSettings] = useState<Settings>(() => ({
    shownInList: property?.shownInList ?? false,
    askedAtCreation: property?.askedAtCreation ?? false,
    required: property?.required ?? false,
  }));
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    (property?.options ?? []).map(({ id, name: optionName, color, issueCount }) => ({
      key: id,
      id,
      name: optionName,
      color,
      issueCount,
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<ReadonlyMap<string, NameProblem>>(new Map());
  const [deleting, setDeleting] = useState(false);
  // Those loaded with the panel and removed since; any other stays.
  const removed = (property?.options ?? []).filter(
    ({ id }) => !drafts.some((draft) => draft.id === id),
  );
  const takenOff = removed.reduce((total, { issueCount }) => total + issueCount, 0);

  // Closed first: a property deleted must not linger in the panel while the list reloads.
  const done = async () => {
    await onSaved();
    await queryClient.invalidateQueries({ queryKey: PropertiesQueries.all });
  };
  const saving = useMutation({
    mutationFn: async () => {
      const options = drafts.map(({ id, name: optionName, color }) => ({
        ...(id ? { id } : {}),
        name: optionName,
        color,
      }));
      const update = { name, ...settings, options, removed: removed.map(({ id }) => id) };
      const create = { name, type: 'list' as const, ...settings, options };
      if (projectKey) {
        await (property
          ? ProjectProperties.update(projectKey, property.id, update)
          : ProjectProperties.create(projectKey, create));
      } else {
        await (property ? Properties.update(property.id, update) : Properties.create(create));
      }
    },
    onSuccess: done,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const options = drafts.map(({ id, name: optionName, color }) => ({
      ...(id ? { id } : {}),
      name: optionName,
      color,
    }));
    // The server's own rules, checked first to point at the field concerned.
    const checked = property
      ? updatePropertyRequestSchema.safeParse({
          name,
          ...settings,
          options,
          removed: removed.map(({ id }) => id),
        })
      : createPropertyRequestSchema.safeParse({ name, type: 'list', ...settings, options });
    if (!checked.success) {
      const found = fieldErrors(checked.error, t);
      setErrors({
        ...(found['name'] ? { name: found['name'] } : {}),
        ...(drafts.length === 0 ? { options: t('properties.noOptions') } : {}),
      });
      setProblems(nameProblemsOf(checked.error.issues, drafts));
      return;
    }
    setErrors({});
    saving.mutate();
  }

  function change(key: string, fields: Partial<Pick<OptionDraft, 'name' | 'color'>>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...fields } : draft)),
    );
    if (fields.name !== undefined) {
      setProblems((current) => new Map([...current].filter(([problemKey]) => problemKey !== key)));
    }
  }

  return (
    <SidePanelContent
      title={property ? property.name : t('properties.newProperty')}
      description={
        projectKey ? t('projectProperties.ownDescription') : t('properties.customDescription')
      }
      closeLabel={t('properties.close')}
      footer={
        <>
          <SidePanelClose asChild>
            <Button variant="secondary">{t('properties.cancel')}</Button>
          </SidePanelClose>
          <Button type="submit" form={formId} disabled={saving.isPending}>
            {saving.isPending ? t('properties.saving') : t('properties.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-6">
        {saving.isError ? (
          <Alert tone="danger">{requestErrorMessage(saving.error, t, KNOWN_ERRORS)}</Alert>
        ) : null}
        {takenOff > 0 ? (
          <Alert>
            {t(`properties.optionsRemovedInUse.${pluralForm(locale, takenOff)}`, {
              count: takenOff,
            })}
          </Alert>
        ) : null}
        <Field label={t('properties.name')} required error={errors['name']}>
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={PROPERTY_NAME_MAX_LENGTH}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <OptionsSection count={drafts.length}>
          {drafts.length > 0 ? (
            <SortableList
              items={drafts}
              nameOf={(draft) => draft.name.trim() || t('properties.unnamed')}
              messages={sortableMessages(t)}
              onReorder={setDrafts}
              className="divide-y divide-border"
              renderItem={(draft, handle) => (
                <CategoryOption
                  draft={draft}
                  position={drafts.indexOf(draft) + 1}
                  handle={handle}
                  problem={problems.get(draft.key)}
                  removable
                  removableWhenUsed
                  onChange={(fields) => change(draft.key, fields)}
                  onRemove={() => setDrafts(drafts.filter(({ key }) => key !== draft.key))}
                />
              )}
            />
          ) : null}
          <AddOption
            full={drafts.length >= PROPERTY_OPTIONS_MAX}
            max={PROPERTY_OPTIONS_MAX}
            onAdd={(optionName) => {
              setErrors(({ options: _, ...others }) => others);
              setDrafts((current) => [
                ...current,
                { key: newOptionKey(), name: optionName, color: nextColor(current), issueCount: 0 },
              ]);
            }}
          />
        </OptionsSection>
        {errors['options'] ? (
          <p role="alert" className="-mt-4 text-sm text-danger">
            {errors['options']}
          </p>
        ) : null}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          <SettingSwitch
            label={t('properties.shownInList')}
            help={t('properties.shownInListHelp')}
            checked={settings.shownInList}
            onChange={(shownInList) => setSettings({ ...settings, shownInList })}
          />
          <SettingSwitch
            label={t('properties.askedAtCreation')}
            help={t('properties.askedAtCreationHelp')}
            checked={settings.askedAtCreation}
            // Only a property asked at creation can be required.
            onChange={(askedAtCreation) =>
              setSettings({
                ...settings,
                askedAtCreation,
                required: askedAtCreation && settings.required,
              })
            }
          />
          <SettingSwitch
            label={t('properties.required')}
            help={t('properties.requiredHelp')}
            checked={settings.required}
            disabled={!settings.askedAtCreation}
            onChange={(required) => setSettings({ ...settings, required })}
          />
        </div>
        {property ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => setDeleting(true)}
              className="text-danger hover:text-danger"
            >
              <Trash2Icon aria-hidden="true" />
              {t('properties.deleteProperty')}
            </Button>
            <DeletePropertyDialog
              property={property}
              projectKey={projectKey}
              open={deleting}
              onOpenChange={setDeleting}
              onDeleted={done}
            />
          </div>
        ) : null}
      </form>
    </SidePanelContent>
  );
}
