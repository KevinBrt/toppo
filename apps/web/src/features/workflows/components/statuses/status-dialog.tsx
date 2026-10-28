import { PALETTE_COLORS, type PaletteColor, STATUS_NAME_MAX_LENGTH } from '@toppo-tracker/shared';
import {
  Button,
  ColorPicker,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
} from '@toppo-tracker/ui';
import { type FormEvent, useId, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { StatusDraft } from '../../models/workflow-draft.model.ts';

type Fields = Pick<StatusDraft, 'name' | 'color' | 'closes'>;

/**
 * A status's name, color and whether it closes issues, for a new one (`status` null) or one of
 * the workflow. What is applied waits, with the rest, for the workflow to be saved.
 */
export function StatusDialog({
  status,
  otherNames,
  initial,
  onApply,
  onClose,
}: {
  status: StatusDraft | null;
  /** The other statuses' names, which this one cannot take. */
  otherNames: readonly string[];
  /** New issues start in it: it cannot close them. */
  initial: boolean;
  onApply: (fields: Fields) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const colorLabel = useId();
  const [name, setName] = useState(status?.name ?? '');
  const [color, setColor] = useState<PaletteColor>(status?.color ?? 'gray');
  const [closes, setCloses] = useState(status?.closes ?? false);
  const [error, setError] = useState<string | undefined>(undefined);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Stops here: the page's own form, if any, is not submitted.
    event.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('workflow.blank'));
    } else if (trimmed.length > STATUS_NAME_MAX_LENGTH) {
      setError(t('validation.tooLong', { max: STATUS_NAME_MAX_LENGTH }));
    } else if (otherNames.some((other) => other.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('workflow.duplicate'));
    } else {
      onApply({ name: trimmed, color, closes });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={status ? t('workflow.editStatus', { name: status.name }) : t('workflow.newStatus')}
        closeLabel={t('workflow.close')}
      >
        <form noValidate onSubmit={apply} className="flex flex-col gap-5">
          <Field label={t('workflow.name')} required error={error}>
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <p id={colorLabel} className="text-sm font-medium text-foreground">
              {t('workflow.color')}
            </p>
            <ColorPicker
              labelledBy={colorLabel}
              colors={PALETTE_COLORS}
              value={color}
              nameOf={(candidate) => t(`colors.${candidate}`)}
              onChange={setColor}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-subtle has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-ring">
            <input
              type="checkbox"
              checked={closes}
              disabled={initial}
              onChange={(event) => setCloses(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{t('workflow.closes')}</span>
              <span className="text-xs text-muted-foreground">
                {initial ? t('workflow.initialCannotClose') : t('workflow.closesHint')}
              </span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('workflow.cancel')}</Button>
            </DialogClose>
            <Button type="submit">{t('workflow.apply')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
