import type { LabelRef } from '@toppo-tracker/shared';
import { Badge, cn } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';

/**
 * An issue's labels as colored chips, by name. Given `max`, the first ones only, then how many
 * more, every name in its tooltip.
 */
export function LabelChips({
  labels,
  max,
  className,
}: {
  labels: readonly LabelRef[];
  max?: number;
  className?: string;
}) {
  const { t, locale } = useI18n();
  if (labels.length === 0) {
    return null;
  }
  const shown = max === undefined ? labels : labels.slice(0, max);
  const more = labels.length - shown.length;

  return (
    <ul aria-label={t('issues.labels')} className={cn('flex min-w-0 flex-wrap gap-1', className)}>
      {shown.map((label) => (
        <li key={label.id} className="min-w-0">
          <Badge tone={label.color} className="h-5 max-w-40 px-2">
            <span className="truncate">{label.name}</span>
          </Badge>
        </li>
      ))}
      {more > 0 ? (
        <li
          title={labels
            .slice(shown.length)
            .map(({ name }) => name)
            .join(', ')}
          className="flex h-5 items-center text-xs text-muted-foreground"
        >
          {t(`issues.moreLabels.${pluralForm(locale, more)}`, { count: more })}
        </li>
      ) : null}
    </ul>
  );
}
