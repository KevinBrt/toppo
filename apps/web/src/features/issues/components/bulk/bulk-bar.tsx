import type { IssueFieldsResponse } from '@toppo/shared';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@toppo/ui';
import { ChevronDownIcon, Trash2Icon, UserIcon, XIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { BulkChange } from '../../models/bulk-change.model.ts';
import type { HideableField } from '../../models/issue-list.model.ts';
import { PersonDialog } from '../fields/person-dialog.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { StatusLabel } from '../fields/status-label.tsx';
import { type BulkConfirmation, ConfirmBulkDialog } from './confirm-bulk-dialog.tsx';

/** What the caller may do on the issues of the project. */
export interface BulkPermissions {
  update: boolean;
  assign: boolean;
  delete: boolean;
}

/** Asks to confirm a change, put as the question the dialog asks. */
type Ask = (change: BulkChange, title: string) => void;

/**
 * The bar the ticked issues of a list bring up, held at the bottom of the screen: how many are
 * ticked, and the actions the caller may take on them all at once, each menu saying what its
 * choices do. Every action is confirmed first; reports the action confirmed.
 */
export function BulkBar({
  projectKey,
  count,
  fields,
  hidden,
  can,
  pending,
  onApply,
  onClear,
}: {
  projectKey: string;
  count: number;
  fields: IssueFieldsResponse | undefined;
  /** The fields the project hides: not offered. */
  hidden: readonly HideableField[];
  can: BulkPermissions;
  pending: boolean;
  onApply: (change: BulkChange) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  const [assigning, setAssigning] = useState(false);
  const [confirming, setConfirming] = useState<BulkConfirmation | null>(null);
  const plural = pluralForm(locale, count);
  const ask: Ask = (change, title) => setConfirming({ change, title });

  return (
    <section
      aria-label={t('issues.bulk.region')}
      className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg">
        <p className="px-2 text-sm font-medium text-foreground">
          {t(`issues.bulk.selected.${plural}`, { count })}
        </p>
        {can.update ? (
          <FieldMenus count={count} fields={fields} hidden={hidden} disabled={pending} ask={ask} />
        ) : null}
        {can.assign ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setAssigning(true)}
          >
            <UserIcon aria-hidden="true" />
            {t('issues.assignee')}
          </Button>
        ) : null}
        {can.update ? (
          <LabelsMenu count={count} fields={fields} disabled={pending} ask={ask} />
        ) : null}
        {can.delete ? (
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              ask({ action: 'delete' }, t(`issues.bulk.deleteTitle.${plural}`, { count }))
            }
            className="ml-auto"
          >
            <Trash2Icon aria-hidden="true" />
            {t('issues.bulk.delete')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('issues.bulk.clear')}
          onClick={onClear}
          className={cn(!can.delete && 'ml-auto')}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <PersonDialog
        projectKey={projectKey}
        title={t(`issues.bulk.assignTitle.${plural}`, { count })}
        open={assigning}
        onOpenChange={setAssigning}
        onChoose={(person) =>
          ask(
            { action: 'assignee', assigneeId: person?.id ?? null },
            person
              ? t(`issues.bulk.confirm.assign.${plural}`, {
                  count,
                  name: person.name ?? t('issues.deletedUser'),
                })
              : t(`issues.bulk.confirm.unassign.${plural}`, { count }),
          )
        }
      />
      <ConfirmBulkDialog
        confirmation={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={(change) => {
          setConfirming(null);
          onApply(change);
        }}
      />
    </section>
  );
}

/** The status, priority and category menus, those the project hides left out. */
function FieldMenus({
  count,
  fields,
  hidden,
  disabled,
  ask,
}: {
  count: number;
  fields: IssueFieldsResponse | undefined;
  hidden: readonly HideableField[];
  disabled: boolean;
  ask: Ask;
}) {
  const { t, locale } = useI18n();
  const plural = pluralForm(locale, count);

  return (
    <>
      <ChoiceMenu
        label={t('issues.status')}
        heading={t(`issues.bulk.statusHeading.${plural}`, { count })}
        disabled={disabled}
      >
        {(fields?.statuses ?? []).map((status) => (
          <DropdownMenuItem
            key={status.id}
            onSelect={() =>
              ask(
                { action: 'status', statusId: status.id },
                t(`issues.bulk.confirm.status.${plural}`, { count, name: status.name }),
              )
            }
          >
            <StatusLabel status={status} />
          </DropdownMenuItem>
        ))}
      </ChoiceMenu>
      {hidden.includes('priority') ? null : (
        <ChoiceMenu
          label={t('issues.priority')}
          heading={t(`issues.bulk.priorityHeading.${plural}`, { count })}
          disabled={disabled}
        >
          {(fields?.priorities ?? []).toReversed().map((priority) => (
            <DropdownMenuItem
              key={priority.id}
              onSelect={() =>
                ask(
                  { action: 'fields', priorityId: priority.id },
                  t(`issues.bulk.confirm.priority.${plural}`, { count, name: priority.name }),
                )
              }
            >
              <PriorityLabel priority={priority} />
            </DropdownMenuItem>
          ))}
        </ChoiceMenu>
      )}
      {hidden.includes('category') ? null : (
        <ChoiceMenu
          label={t('issues.category')}
          heading={t(`issues.bulk.categoryHeading.${plural}`, { count })}
          disabled={disabled}
        >
          {(fields?.categories ?? []).map((category) => (
            <DropdownMenuItem
              key={category.id}
              onSelect={() =>
                ask(
                  { action: 'fields', categoryId: category.id },
                  t(`issues.bulk.confirm.category.${plural}`, { count, name: category.name }),
                )
              }
            >
              {category.name}
            </DropdownMenuItem>
          ))}
        </ChoiceMenu>
      )}
    </>
  );
}

/** The labels to add to the ticked issues, then those to take off them; none without labels. */
function LabelsMenu({
  count,
  fields,
  disabled,
  ask,
}: {
  count: number;
  fields: IssueFieldsResponse | undefined;
  disabled: boolean;
  ask: Ask;
}) {
  const { t, locale } = useI18n();
  const plural = pluralForm(locale, count);
  const labels = fields?.labels ?? [];
  if (labels.length === 0) {
    return null;
  }

  return (
    <ChoiceMenu
      label={t('issues.labels')}
      heading={t(`issues.bulk.addHeading.${plural}`, { count })}
      disabled={disabled}
    >
      {labels.map((label) => (
        <DropdownMenuItem
          key={label.id}
          aria-label={t('issues.bulk.addNamed', { name: label.name })}
          onSelect={() =>
            ask(
              { action: 'labels', add: [label.id], remove: [] },
              t(`issues.bulk.confirm.addLabel.${plural}`, { count, name: label.name }),
            )
          }
        >
          {label.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t(`issues.bulk.removeHeading.${plural}`, { count })}</DropdownMenuLabel>
      {labels.map((label) => (
        <DropdownMenuItem
          key={label.id}
          aria-label={t('issues.bulk.removeNamed', { name: label.name })}
          onSelect={() =>
            ask(
              { action: 'labels', add: [], remove: [label.id] },
              t(`issues.bulk.confirm.removeLabel.${plural}`, { count, name: label.name }),
            )
          }
        >
          {label.name}
        </DropdownMenuItem>
      ))}
    </ChoiceMenu>
  );
}

/** A button opening the values an action offers, under a heading saying what choosing one does. */
function ChoiceMenu({
  label,
  heading,
  disabled,
  children,
}: {
  label: string;
  heading: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled}>
          {label}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
