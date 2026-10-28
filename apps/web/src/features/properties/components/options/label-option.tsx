import { LABEL_NAME_MAX_LENGTH } from '@toppo-tracker/shared';
import { Button, Input } from '@toppo-tracker/ui';
import { XIcon } from 'lucide-react';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import type { NameProblem } from '../../utils/option-drafts.util.ts';
import { NAME_FIELD_CLASS } from './category-option.tsx';
import { ColorMenu } from './color-menu.tsx';
import { NameError } from './name-error.tsx';

/**
 * One label in the panel: its color, its name typed in place, how many issues have it, and the
 * way to remove it, which takes it off them once saved.
 */
export function LabelOption({
  draft,
  position,
  problem,
  onChange,
  onRemove,
}: {
  draft: OptionDraft;
  position: number;
  problem: NameProblem | undefined;
  onChange: (change: Partial<Pick<OptionDraft, 'name' | 'color'>>) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const errorId = useId();
  const name = draft.name.trim() || t('properties.unnamed');

  return (
    <div className="flex flex-col py-1">
      <div className="flex items-center gap-1 px-1.5">
        <ColorMenu name={name} color={draft.color} onChange={(color) => onChange({ color })} />
        <Input
          aria-label={t('properties.labelName', { position })}
          aria-invalid={Boolean(problem)}
          {...(problem ? { 'aria-describedby': errorId } : {})}
          value={draft.name}
          maxLength={100}
          onChange={(event) => onChange({ name: event.target.value })}
          className={NAME_FIELD_CLASS}
        />
        {draft.issueCount > 0 ? (
          <span className="shrink-0 px-1 text-xs whitespace-nowrap text-muted-foreground">
            {t(`properties.inUse.${pluralForm(locale, draft.issueCount)}`, {
              count: draft.issueCount,
            })}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('properties.remove', { name })}
          onClick={onRemove}
          className="text-muted-foreground"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {problem ? <NameError id={errorId} problem={problem} max={LABEL_NAME_MAX_LENGTH} /> : null}
    </div>
  );
}
