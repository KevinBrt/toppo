import { useMutation } from '@tanstack/react-query';
import type { WorkflowRequest } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useEffect, useMemo, useState } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { UnsavedChangesBar } from '../../../shared/forms/unsaved-changes-bar.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import type { WorkflowDraft } from '../models/workflow-draft.model.ts';
import { countChanges, draftOf, requestOf } from '../utils/workflow-draft.util.ts';
import { StatusesCard } from './statuses/statuses-card.tsx';
import { TransitionsCard } from './transitions/transitions-card.tsx';

const KNOWN_ERRORS = {
  WORKFLOW_CHANGED: 'workflow.changed',
  STATUS_NAME_TAKEN: 'workflow.nameTaken',
  STATUS_SHARED: 'workflow.sharedChanged',
  NOT_CUSTOMIZED: 'workflow.notCustomized',
} as const;

/**
 * A workflow edited in place: its statuses, then which may follow which. Changes stay local until
 * saved, all at once; the screen asks before leaving with some unsaved.
 */
export function WorkflowEditor({
  workflow,
  readOnly = false,
  save,
  onSaved,
  onPendingChange,
}: {
  workflow: Parameters<typeof draftOf>[0];
  /** Only shown: a project following the instance's workflow. */
  readOnly?: boolean;
  save: (request: WorkflowRequest) => Promise<void>;
  /** Once saved, to refresh what shows the workflow. */
  onSaved: () => Promise<void> | void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useI18n();
  const saved = useMemo(() => draftOf(workflow), [workflow]);
  const [changed, setChanged] = useState<WorkflowDraft | null>(null);
  const [outcome, setOutcome] = useState<{ saved: true } | { failure: unknown } | null>(null);
  const draft = changed ?? saved;
  const pending = changed ? countChanges(saved, changed) : 0;
  useEffect(() => onPendingChange?.(pending > 0), [pending, onPendingChange]);

  const saving = useMutation({
    mutationFn: () => save(requestOf(draft)),
    onSuccess: async () => {
      await onSaved();
      setChanged(null);
      setOutcome({ saved: true });
    },
    onError: (failure) => setOutcome({ failure }),
  });

  function change(next: WorkflowDraft) {
    setChanged(next);
    setOutcome(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {outcome && 'failure' in outcome ? (
        <Alert tone="danger">{requestErrorMessage(outcome.failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      {outcome && 'saved' in outcome ? <Alert>{t('workflow.saved')}</Alert> : null}
      <StatusesCard draft={draft} readOnly={readOnly} onChange={change} />
      <TransitionsCard draft={draft} readOnly={readOnly} onChange={change} />
      {pending > 0 ? (
        <UnsavedChangesBar
          count={pending}
          saving={saving.isPending}
          onSave={() => saving.mutate()}
          onDiscard={() => {
            setChanged(null);
            setOutcome(null);
          }}
        />
      ) : null}
    </div>
  );
}
