import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  swatchClassName,
  toneClassName,
} from '@toppo-tracker/ui';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { StatusDraft } from '../../models/workflow-draft.model.ts';

/** What may be done to a status of the workflow being edited. */
export interface StatusActions {
  /** False for the initial status and the last one left. */
  removable: boolean;
  onChange: (fields: Pick<StatusDraft, 'closes'>) => void;
  onEdit: () => void;
  onMakeInitial: () => void;
  onRemove: () => void;
}

/**
 * One status of the workflow: its handle, color and name, the issues on it, whether it closes
 * them (never the initial one, where new issues start), and its actions. The instance's statuses
 * in a project's copy keep their name, color and closing.
 */
export function StatusRow({
  status,
  handle,
  initial,
  actions,
}: {
  status: StatusDraft;
  handle: ReactNode;
  initial: boolean;
  /** None while the workflow is only shown. */
  actions: StatusActions | null;
}) {
  const { t, locale } = useI18n();
  const lockedBecause = initial ? t('workflow.initialCannotClose') : t('workflow.sharedHint');

  return (
    <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
      {handle}
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md',
          toneClassName(status.color),
        )}
      >
        <span className={cn('size-2 rounded-full', swatchClassName(status.color))} />
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium text-foreground">{status.name}</span>
        {initial ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {t('workflow.initial')}
          </span>
        ) : null}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-sm text-muted-foreground sm:block">
        {t(`workflow.issues.${pluralForm(locale, status.issueCount)}`, {
          count: status.issueCount,
        })}
      </span>
      <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-not-allowed sm:w-28 pointer-coarse:size-11 sm:pointer-coarse:w-28">
        <input
          type="checkbox"
          aria-label={t('workflow.closesLabel', { name: status.name })}
          checked={status.closes}
          disabled={!actions || initial || status.shared}
          {...(actions && (initial || status.shared) ? { title: lockedBecause } : {})}
          onChange={(event) => actions?.onChange({ closes: event.target.checked })}
          className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
      </label>
      {actions ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('workflow.actions', { name: status.name })}
              className="shrink-0 text-muted-foreground"
            >
              <EllipsisVerticalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled={status.shared} onSelect={actions.onEdit}>
              {t('workflow.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={initial || status.closes} onSelect={actions.onMakeInitial}>
              {t('workflow.makeInitial')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!actions.removable} onSelect={actions.onRemove}>
              {t('workflow.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span aria-hidden="true" className="w-9 shrink-0" />
      )}
    </div>
  );
}
