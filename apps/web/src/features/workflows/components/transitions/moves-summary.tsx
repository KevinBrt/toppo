import { cn, StatusBadge, swatchClassName } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { StatusDraft, WorkflowDraft } from '../../models/workflow-draft.model.ts';
import { allows } from '../../utils/workflow-draft.util.ts';

/** "An issue [In progress] may move to [To do] [Resolved]": the moves of one row, in words. */
export function MovesSummary({ draft, status }: { draft: WorkflowDraft; status: StatusDraft }) {
  const { t } = useI18n();
  const targets = draft.statuses.filter(({ key }) => allows(draft.moves, status.key, key));

  return (
    <p className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4 text-sm text-muted-foreground">
      {t('workflow.summaryStart')} <StatusBadge status={status} />{' '}
      {targets.length > 0 ? (
        <>
          {t('workflow.summaryMayMove')}{' '}
          {targets.map((target) => (
            <span
              key={target.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              <span
                aria-hidden="true"
                className={cn('size-1.5 rounded-full', swatchClassName(target.color))}
              />
              {target.name}
            </span>
          ))}
        </>
      ) : (
        t('workflow.summaryNowhere')
      )}
    </p>
  );
}
