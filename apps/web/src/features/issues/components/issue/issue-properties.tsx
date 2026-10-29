import type { IssueFieldsResponse, IssueResponse } from '@toppo-tracker/shared';
import { StatusBadge } from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { formatFullDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { IssueEdit } from '../../models/issue-edit.model.ts';
import { ChoicesField } from '../fields/choices-field.tsx';
import { FIELD_TRIGGER_CLASS, FieldMenu } from '../fields/field-menu.tsx';
import { PersonDialog } from '../fields/person-dialog.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { PropertyField } from '../properties/property-field.tsx';

/**
 * The issue's fields beside it, one per row, their values aligned: status, priority, assignee,
 * category, labels and the instance's properties, changed in place by who may; then who
 * reported it and when.
 */
export function IssueProperties({
  issue,
  fields,
  onEdit,
}: {
  issue: IssueResponse;
  fields: IssueFieldsResponse | undefined;
  onEdit: (edit: IssueEdit) => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const editsFields = issue.actions.includes('editFields') && fields !== undefined;
  const statuses = fields?.statuses ?? [];
  const next = statuses.find(({ id }) => id === issue.status.id)?.next ?? [];
  const reachable = [issue.status, ...statuses.filter(({ id }) => next.includes(id))];

  return (
    <aside
      aria-labelledby={titleId}
      className="rounded-xl border border-border bg-surface p-5 shadow-xs"
    >
      <h2 id={titleId} className="mb-3 text-base font-semibold text-foreground">
        {t('issues.properties')}
      </h2>
      <dl className="flex flex-col">
        <Property label={t('issues.status')}>
          <FieldMenu
            label={t('issues.status')}
            disabled={!issue.actions.includes('changeStatus') || next.length === 0}
            value={issue.status.id}
            options={reachable.map((status) => ({
              value: status.id,
              text: status.name,
              content: <StatusBadge status={status} />,
            }))}
            onChange={(statusId) => {
              const status = statuses.find(({ id }) => id === statusId);
              if (status) {
                const { id, name, color, closes } = status;
                onEdit({ field: 'status', status: { id, name, color, closes } });
              }
            }}
          />
        </Property>
        {fields?.fieldSettings.priority.hidden ? null : (
          <Property label={t('issues.priority')}>
            <FieldMenu
              label={t('issues.priority')}
              disabled={!editsFields}
              value={issue.priority.id}
              options={(fields?.priorities ?? [issue.priority]).map((priority) => ({
                value: priority.id,
                text: priority.name,
                content: <PriorityLabel priority={priority} />,
              }))}
              onChange={(priorityId) => {
                const priority = fields?.priorities.find(({ id }) => id === priorityId);
                if (priority) {
                  const { id, name, level } = priority;
                  onEdit({ field: 'priority', priority: { id, name, level } });
                }
              }}
            />
          </Property>
        )}
        <Property label={t('issues.assignee')}>
          <AssigneeField issue={issue} onEdit={onEdit} />
        </Property>
        {fields?.fieldSettings.category.hidden ? null : (
          <Property label={t('issues.category')}>
            <FieldMenu
              label={t('issues.category')}
              disabled={!editsFields}
              value={issue.category.id}
              options={(fields?.categories ?? [issue.category]).map((category) => ({
                value: category.id,
                text: category.name,
                content: category.name,
              }))}
              onChange={(categoryId) => {
                const category = fields?.categories.find(({ id }) => id === categoryId);
                if (category) {
                  const { id, name, color } = category;
                  onEdit({ field: 'category', category: { id, name, color } });
                }
              }}
            />
          </Property>
        )}
        <Property label={t('issues.labels')}>
          <ChoicesField
            label={t('issues.labels')}
            chosen={issue.labels}
            options={fields?.labels ?? []}
            none={t('issues.noLabels')}
            noOptions={t('issues.labelsEmpty')}
            disabled={!editsFields}
            onChange={(labels) => onEdit({ field: 'labels', labels })}
          />
        </Property>
        {(fields?.properties ?? []).map((property) => (
          <Property key={property.id} label={property.name}>
            <PropertyField
              property={property}
              value={issue.properties.find(({ id }) => id === property.id)}
              projectKey={issue.project.key}
              // Naming someone is choosing among those who may be assigned; what a plugin writes,
              // no one types in.
              disabled={
                !editsFields ||
                property.writtenBy === 'plugin' ||
                (property.type === 'user' && !issue.actions.includes('assign'))
              }
              onChange={(value) => onEdit({ field: 'property', propertyId: property.id, value })}
            />
          </Property>
        ))}
        <Property label={t('issues.reporter')}>
          <PersonName person={issue.reporter} withAvatar={false} />
        </Property>
        <Property label={t('issues.createdAt')}>
          {formatFullDateTime(issue.createdAt, locale)}
        </Property>
      </dl>
    </aside>
  );
}

/** A row: the field's name, then its value where every other value starts. */
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Who the issue is given to, chosen in a dialog that searches the people of the project. */
function AssigneeField({
  issue,
  onEdit,
}: {
  issue: IssueResponse;
  onEdit: (edit: IssueEdit) => void;
}) {
  const { t } = useI18n();
  const [choosing, setChoosing] = useState(false);
  const shown = issue.assignee ? (
    <PersonName person={issue.assignee} />
  ) : (
    <span className="text-muted-foreground">{t('issues.unassigned')}</span>
  );

  if (!issue.actions.includes('assign')) {
    return shown;
  }
  const current = issue.assignee?.name ?? t('issues.unassigned');
  return (
    <>
      <button
        type="button"
        aria-label={`${t('issues.assignee')}, ${current}`}
        onClick={() => setChoosing(true)}
        className={FIELD_TRIGGER_CLASS}
      >
        <span className="min-w-0">{shown}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <PersonDialog
        projectKey={issue.project.key}
        title={t('issues.assignTitle', { key: issue.key })}
        current={issue.assignee}
        open={choosing}
        onOpenChange={setChoosing}
        onChoose={(assignee) => onEdit({ field: 'assignee', assignee })}
      />
    </>
  );
}
