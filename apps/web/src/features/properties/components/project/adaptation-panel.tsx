import { useMutation } from '@tanstack/react-query';
import {
  hasOptions,
  PROPERTY_OPTIONS_MAX,
  type ProjectPropertiesResponse,
  propertyAdaptationRequestSchema,
} from '@toppo/shared';
import {
  Alert,
  Badge,
  Button,
  SidePanel,
  SidePanelClose,
  SidePanelContent,
  SortableList,
} from '@toppo/ui';
import { type FormEvent, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { sortableMessages } from '../../../../shared/forms/sortable-messages.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { ProjectProperties } from '../../api/project-properties.api.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import {
  type NameProblem,
  nameProblemsOf,
  newOptionKey,
  nextColor,
} from '../../utils/option-drafts.util.ts';
import { AddOption } from '../options/add-option.tsx';
import { CategoryOption } from '../options/category-option.tsx';
import { OptionsSection } from '../options/options-section.tsx';
import { SettingSwitch } from '../panels/setting-switch.tsx';

type AdaptedProperty = ProjectPropertiesResponse['instance'][number];

const KNOWN_ERRORS = {
  PROPERTY_CHANGED: 'properties.changed',
  OPTION_NAME_TAKEN: 'properties.nameTaken',
  PROPERTY_NOT_FOUND: 'properties.propertyGone',
} as const;

/** The project's own options, checked as the server checks them. */
const ownOptionsSchema = propertyAdaptationRequestSchema.shape.options.unwrap();

/**
 * How the project adapts a property of the organization, beside the page: hidden there, and
 * options of its own, starting from the organization's. Reports the save.
 */
export function AdaptationPanel({
  open,
  onOpenChange,
  projectKey,
  property,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  property: AdaptedProperty | null;
  onSaved: () => Promise<void> | void;
}) {
  return (
    <SidePanel open={open && property !== null} onOpenChange={onOpenChange}>
      {/* Mounted while open only: each opening starts again from what is saved. */}
      {open && property ? (
        <AdaptationEditor projectKey={projectKey} property={property} onSaved={onSaved} />
      ) : null}
    </SidePanel>
  );
}

/** What its issues lose: the options removed, or all its own when it takes the organization's. */
function lostOptions(
  property: AdaptedProperty,
  own: boolean,
  removed: AdaptedProperty['options'],
): AdaptedProperty['options'] {
  if (own) {
    return removed;
  }
  return property.ownOptions ? property.options : [];
}

function AdaptationEditor({
  projectKey,
  property,
  onSaved,
}: {
  projectKey: string;
  property: AdaptedProperty;
  onSaved: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const formId = useId();
  // Only a list or a multi-select may have options of its own.
  const withOptions = hasOptions(property.type);
  const [hidden, setHidden] = useState(property.hidden);
  const [own, setOwn] = useState(property.ownOptions);
  // The project's own options, or the organization's to start from: kept by their ids.
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    property.options.map(({ id, name, color, issueCount }) => ({
      key: id,
      id,
      name,
      color,
      issueCount,
    })),
  );
  const [problems, setProblems] = useState<ReadonlyMap<string, NameProblem>>(new Map());
  const removed = property.options.filter(({ id }) => !drafts.some((draft) => draft.id === id));
  const lost = lostOptions(property, own, removed);
  const takenOff = lost.reduce((total, { issueCount }) => total + issueCount, 0);

  const saving = useMutation({
    mutationFn: () =>
      ProjectProperties.adapt(projectKey, property.id, {
        hidden,
        options: own ? ownOptions() : null,
      }),
    onSuccess: onSaved,
  });

  function ownOptions() {
    return {
      options: drafts.map(({ id, name, color }) => ({ ...(id ? { id } : {}), name, color })),
      removed: removed.map(({ id }) => id),
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (own) {
      const checked = ownOptionsSchema.safeParse(ownOptions());
      if (!checked.success) {
        setProblems(nameProblemsOf(checked.error.issues, drafts));
        return;
      }
    }
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
      title={property.name}
      description={t('projectProperties.adaptDescription')}
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
            {t(`projectProperties.takenOff.${pluralForm(locale, takenOff)}`, { count: takenOff })}
          </Alert>
        ) : null}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          <SettingSwitch
            label={t('projectProperties.hidden')}
            help={t('projectProperties.hiddenHelp')}
            checked={hidden}
            onChange={setHidden}
          />
          {withOptions ? (
            <SettingSwitch
              label={t('projectProperties.ownOptions')}
              help={t('projectProperties.ownOptionsHelp')}
              checked={own}
              onChange={setOwn}
            />
          ) : null}
        </div>
        {withOptions && own ? (
          <OptionsSection count={drafts.length}>
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
                  removable={drafts.length > 1}
                  removableWhenUsed
                  onChange={(fields) => change(draft.key, fields)}
                  onRemove={() => setDrafts(drafts.filter(({ key }) => key !== draft.key))}
                />
              )}
            />
            <AddOption
              full={drafts.length >= PROPERTY_OPTIONS_MAX}
              max={PROPERTY_OPTIONS_MAX}
              onAdd={(name) =>
                setDrafts((current) => [
                  ...current,
                  { key: newOptionKey(), name, color: nextColor(current), issueCount: 0 },
                ])
              }
            />
          </OptionsSection>
        ) : null}
        {withOptions && !own ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {t('projectProperties.instanceOptions')}
            </h3>
            <ul className="flex flex-wrap gap-1">
              {(property.ownOptions ? [] : property.options).map((option) => (
                <li key={option.id}>
                  <Badge tone={option.color}>{option.name}</Badge>
                </li>
              ))}
            </ul>
            {property.ownOptions ? (
              <p className="text-sm text-muted-foreground">
                {t('projectProperties.backToInstance')}
              </p>
            ) : null}
          </section>
        ) : null}
      </form>
    </SidePanelContent>
  );
}
