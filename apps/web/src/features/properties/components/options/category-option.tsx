import { CATEGORY_NAME_MAX_LENGTH } from '@toppo/shared';
import { Button, Input } from '@toppo/ui';
import { XIcon } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import type { NameProblem } from '../../utils/option-drafts.util.ts';
import { ColorMenu } from './color-menu.tsx';
import { NameError } from './name-error.tsx';

/** A name typed in place: it reads like text until hovered or focused. */
export const NAME_FIELD_CLASS =
  'h-9 min-w-0 flex-1 border-transparent bg-transparent shadow-none hover:border-border';

/**
 * One option in a panel: its handle, its color, its name typed in place, and the way to remove
 * it. Issues having a category prevent removing it (their count says why); an option of a
 * property is taken off them instead.
 */
export function CategoryOption({
  draft,
  position,
  handle,
  problem,
  removable,
  removableWhenUsed = false,
  onChange,
  onRemove,
}: {
  draft: OptionDraft;
  position: number;
  handle: ReactNode;
  problem: NameProblem | undefined;
  /** False for the last option left: a list keeps at least one. */
  removable: boolean;
  /** Removed even while issues have it, taken off them: a property's option. */
  removableWhenUsed?: boolean;
  onChange: (change: Partial<Pick<OptionDraft, 'name' | 'color'>>) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const errorId = useId();
  const usedId = useId();
  const name = draft.name.trim() || t('properties.unnamed');
  const used = draft.issueCount > 0;
  const locked = used && !removableWhenUsed;

  return (
    <div className="flex flex-col py-1">
      <div className="flex items-center gap-1 px-1.5">
        {handle}
        <ColorMenu name={name} color={draft.color} onChange={(color) => onChange({ color })} />
        <Input
          aria-label={t('properties.optionName', { position })}
          aria-invalid={Boolean(problem)}
          {...(problem ? { 'aria-describedby': errorId } : {})}
          value={draft.name}
          maxLength={100}
          onChange={(event) => onChange({ name: event.target.value })}
          className={NAME_FIELD_CLASS}
        />
        {used ? (
          <span
            id={usedId}
            className="shrink-0 px-1 text-xs whitespace-nowrap text-muted-foreground"
          >
            {t(`properties.inUse.${pluralForm(locale, draft.issueCount)}`, {
              count: draft.issueCount,
            })}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('properties.remove', { name })}
          {...(locked ? { 'aria-describedby': usedId, title: t('properties.inUseHint') } : {})}
          disabled={locked || !removable}
          onClick={onRemove}
          className="text-muted-foreground"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {problem ? <NameError id={errorId} problem={problem} max={CATEGORY_NAME_MAX_LENGTH} /> : null}
    </div>
  );
}
