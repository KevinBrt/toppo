import { WORKFLOW_STATUSES_MAX } from '@toppo-tracker/shared';
import { Button, SortableList } from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { sortableMessages } from '../../../../shared/forms/sortable-messages.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { StatusDraft, WorkflowDraft } from '../../models/workflow-draft.model.ts';
import { newStatusKey, removeStatus, updateStatus } from '../../utils/workflow-draft.util.ts';
import { RemoveStatusDialog } from './remove-status-dialog.tsx';
import { StatusDialog } from './status-dialog.tsx';
import { StatusRow } from './status-row.tsx';

/**
 * The workflow's statuses, in the order the menus show them: dragged into place, closing issues
 * or not, edited, added, made the initial one, or taken out (their issues moving elsewhere).
 */
export function StatusesCard({
  draft,
  readOnly,
  onChange,
}: {
  draft: WorkflowDraft;
  /** Only shown: a project following the instance's workflow. */
  readOnly: boolean;
  onChange: (draft: WorkflowDraft) => void;
}) {
  const { t } = useI18n();
  // The status being edited, `null` for a new one; nothing while the dialog is closed.
  const [editing, setEditing] = useState<StatusDraft | null | undefined>(undefined);
  const [removing, setRemoving] = useState<StatusDraft | null>(null);
  const full = draft.statuses.length >= WORKFLOW_STATUSES_MAX;

  return (
    <section
      aria-label={t('workflow.statuses')}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      <div
        aria-hidden="true"
        className="hidden items-center gap-2 border-b border-border py-2.5 pr-3 pl-[4.75rem] text-xs text-muted-foreground sm:flex"
      >
        <span className="flex-1">{t('workflow.status')}</span>
        <span className="w-24 text-right">{t('workflow.issuesColumn')}</span>
        <span className="w-28 text-center">{t('workflow.closes')}</span>
        <span className="w-9" />
      </div>
      {readOnly ? (
        <ul className="divide-y divide-border">
          {draft.statuses.map((status) => (
            <li key={status.key}>
              <StatusRow
                status={status}
                handle={<span aria-hidden="true" className="size-8 shrink-0" />}
                initial={status.key === draft.initialKey}
                actions={null}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SortableList
          items={draft.statuses}
          nameOf={({ name }) => name}
          messages={sortableMessages(t)}
          onReorder={(statuses) => onChange({ ...draft, statuses })}
          className="divide-y divide-border"
          renderItem={(status, handle) => (
            <StatusRow
              status={status}
              handle={handle}
              initial={status.key === draft.initialKey}
              actions={{
                removable: draft.statuses.length > 1 && status.key !== draft.initialKey,
                onChange: (fields) => onChange(updateStatus(draft, status.key, fields)),
                onEdit: () => setEditing(status),
                onMakeInitial: () => onChange({ ...draft, initialKey: status.key }),
                onRemove: () =>
                  // A status added since the last save has no issue: it just goes.
                  status.id
                    ? setRemoving(status)
                    : onChange(removeStatus(draft, status.key, draft.initialKey)),
              }}
            />
          )}
        />
      )}
      {readOnly ? null : (
        <div className="border-t border-border px-3 py-2">
          {full ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {t('workflow.limit', { max: WORKFLOW_STATUSES_MAX })}
            </p>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              <PlusIcon aria-hidden="true" />
              {t('workflow.add')}
            </Button>
          )}
        </div>
      )}
      {editing !== undefined ? (
        <StatusDialog
          status={editing}
          otherNames={draft.statuses
            .filter(({ key }) => key !== editing?.key)
            .map(({ name }) => name)}
          initial={editing?.key === draft.initialKey}
          onApply={(fields) => {
            onChange(
              editing
                ? updateStatus(draft, editing.key, fields)
                : {
                    ...draft,
                    statuses: [
                      ...draft.statuses,
                      { key: newStatusKey(), ...fields, issueCount: 0, shared: false },
                    ],
                  },
            );
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {removing ? (
        <RemoveStatusDialog
          status={removing}
          targets={draft.statuses.filter(({ key }) => key !== removing.key)}
          initialKey={draft.initialKey}
          onRemove={(moveTo) => {
            onChange(removeStatus(draft, removing.key, moveTo));
            setRemoving(null);
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}
