import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hasOptions,
  type ProjectFields,
  type ProjectPropertiesResponse,
  type PropertyRow,
  type PropertyType,
} from '@toppo-tracker/shared';
import { Alert, Badge, Button, Switch } from '@toppo-tracker/ui';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ProjectProperties } from '../../api/project-properties.api.ts';
import { PROPERTY_TYPE_ICONS } from '../../constants/property-types.constants.ts';
import { PropertiesQueries } from '../../queries/properties.queries.ts';
import { PropertyPanel } from '../panels/property-panel.tsx';
import { AdaptationPanel } from './adaptation-panel.tsx';

type FieldName = keyof ProjectFields;

/**
 * How a project takes the issues' fields: the category and the priority, hidden or required at
 * once; the organization's properties, each adapted beside the page; then its own properties.
 * Reports each change, for the issues to offer what the project now takes.
 */
export function ProjectPropertiesEditor({
  projectKey,
  onChanged,
}: {
  projectKey: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const adaptations = useQuery(PropertiesQueries.project(projectKey));
  // A property of the organization by its id, or of the project's own (a new one: no id yet).
  const [editing, setEditing] = useState<
    { kind: 'instance'; id: string } | { kind: 'own'; id: string | null } | null
  >(null);
  const refresh = async () => {
    setEditing(null);
    await queryClient.invalidateQueries({
      queryKey: PropertiesQueries.project(projectKey).queryKey,
    });
    await onChanged();
  };
  const saveFields = useMutation({
    mutationFn: (fields: ProjectFields) => ProjectProperties.saveFields(projectKey, fields),
    onSuccess: refresh,
  });

  if (adaptations.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('projectProperties.loading')}
      </p>
    );
  }
  if (adaptations.isError) {
    return <Alert tone="danger">{requestErrorMessage(adaptations.error, t)}</Alert>;
  }
  const { fields: saved, instance, own } = adaptations.data;
  // The switches move at once; they move back if the server refuses.
  const fields = saveFields.isPending ? saveFields.variables : saved;
  const changeField = (name: FieldName, setting: 'hidden' | 'required', on: boolean) => {
    // Hidden and required exclude each other.
    const other = setting === 'hidden' ? 'required' : 'hidden';
    saveFields.mutate({
      ...fields,
      [name]: { ...fields[name], [setting]: on, ...(on ? { [other]: false } : {}) },
    });
  };
  const editingInstance = editing?.kind === 'instance' ? editing.id : null;
  const editingOwn = editing?.kind === 'own' ? editing : null;

  return (
    <div className="flex flex-col gap-6">
      {saveFields.isError ? (
        <Alert tone="danger">{requestErrorMessage(saveFields.error, t)}</Alert>
      ) : null}
      <Section
        title={t('projectProperties.instanceSection')}
        hint={t('projectProperties.instanceHint')}
      >
        {(['priority', 'category'] as const).map((name) => (
          <li key={name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <PropertyIcon />
              <span className="text-sm font-medium text-foreground">
                {t(name === 'priority' ? 'properties.priority' : 'properties.category')}
              </span>
            </span>
            <FieldSwitch
              label={t('projectProperties.hidden')}
              name={t(name === 'priority' ? 'properties.priority' : 'properties.category')}
              accessibleLabel="hiddenField"
              checked={fields[name].hidden}
              onChange={(on) => changeField(name, 'hidden', on)}
            />
            <FieldSwitch
              label={t('projectProperties.required')}
              name={t(name === 'priority' ? 'properties.priority' : 'properties.category')}
              accessibleLabel="requiredField"
              checked={fields[name].required}
              onChange={(on) => changeField(name, 'required', on)}
            />
          </li>
        ))}
        {instance.map((property) => (
          <PropertyLine
            key={property.id}
            property={property}
            badges={
              <>
                {property.hidden ? <Badge>{t('projectProperties.hiddenBadge')}</Badge> : null}
                {property.ownOptions ? (
                  <Badge tone="blue">{t('projectProperties.ownOptionsBadge')}</Badge>
                ) : null}
              </>
            }
            onOpen={() => setEditing({ kind: 'instance', id: property.id })}
          />
        ))}
      </Section>
      <p className="-mt-3 text-xs text-muted-foreground">{t('projectProperties.fieldsHelp')}</p>
      <Section title={t('projectProperties.ownSection')} hint={t('projectProperties.ownHint')}>
        {own.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            {t('projectProperties.noOwn')}
          </li>
        ) : null}
        {own.map((property) => (
          <PropertyLine
            key={property.id}
            property={property}
            onOpen={() => setEditing({ kind: 'own', id: property.id })}
          />
        ))}
        <li className="px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setEditing({ kind: 'own', id: null })}>
            <PlusIcon aria-hidden="true" />
            {t('properties.newProperty')}
          </Button>
        </li>
      </Section>
      <AdaptationPanel
        open={editingInstance !== null}
        onOpenChange={(open) => setEditing(open ? editing : null)}
        projectKey={projectKey}
        property={instance.find(({ id }) => id === editingInstance) ?? null}
        onSaved={refresh}
      />
      <PropertyPanel
        open={editingOwn !== null}
        onOpenChange={(open) => setEditing(open ? editing : null)}
        property={own.find(({ id }) => id === editingOwn?.id) ?? null}
        projectKey={projectKey}
        onSaved={refresh}
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <h2 className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>
        {' · '}
        {hint}
      </h2>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function PropertyIcon({ type = 'list' }: { type?: PropertyType }) {
  const Icon = PROPERTY_TYPE_ICONS[type];
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted-foreground"
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * A property as a line opening its panel: its name, its options or what its type holds, and how
 * the project takes it.
 */
function PropertyLine({
  property,
  badges,
  onOpen,
}: {
  property: PropertyRow | ProjectPropertiesResponse['instance'][number];
  badges?: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <PropertyIcon type={property.type} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            {property.name}
            {badges}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {hasOptions(property.type)
              ? property.options.map(({ name }) => name).join(', ')
              : t(`properties.types.${property.type}`)}
          </span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** One switch of the category or the priority, its label beside it. */
function FieldSwitch({
  label,
  name,
  accessibleLabel,
  checked,
  onChange,
}: {
  label: string;
  name: string;
  accessibleLabel: 'hiddenField' | 'requiredField';
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Switch
        checked={checked}
        aria-label={t(`projectProperties.${accessibleLabel}`, { name })}
        onCheckedChange={onChange}
      />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
