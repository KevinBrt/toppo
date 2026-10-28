import { Button, Dialog, DialogClose, DialogContent, Field, Select } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { StatusDraft } from '../../models/workflow-draft.model.ts';

/**
 * Takes a saved status out of the workflow, asking where its issues go when it has some. Applied
 * with the rest when the workflow is saved, one activity per moved issue.
 */
export function RemoveStatusDialog({
  status,
  targets,
  initialKey,
  onRemove,
  onClose,
}: {
  status: StatusDraft;
  /** The statuses its issues may move to. */
  targets: readonly StatusDraft[];
  initialKey: string;
  onRemove: (moveTo: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [moveTo, setMoveTo] = useState(initialKey);
  const count = status.issueCount;

  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onRemove(moveTo);
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('workflow.removeTitle', { name: status.name })}
        description={
          count > 0
            ? t(`workflow.removeIssues.${pluralForm(locale, count)}`, { count })
            : t('workflow.removeEmpty')
        }
        closeLabel={t('workflow.close')}
      >
        <form noValidate onSubmit={remove} className="flex flex-col gap-5">
          {count > 0 ? (
            <Field label={t('workflow.moveTo')}>
              {(control) => (
                <Select
                  {...control}
                  value={moveTo}
                  onChange={(event) => setMoveTo(event.target.value)}
                >
                  {targets.map((target) => (
                    <option key={target.key} value={target.key}>
                      {target.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('workflow.cancel')}</Button>
            </DialogClose>
            <Button type="submit" variant="danger">
              {t('workflow.removeConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
