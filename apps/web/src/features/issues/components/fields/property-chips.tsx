import type { IssuePropertyValue } from '@toppo/shared';
import { Badge, cn } from '@toppo/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The values of an issue's properties as colored chips, each read with its property's name. */
export function PropertyChips({
  values,
  className,
}: {
  values: readonly IssuePropertyValue[];
  className?: string;
}) {
  const { t } = useI18n();
  if (values.length === 0) {
    return null;
  }
  return (
    <ul
      aria-label={t('issues.properties')}
      className={cn('flex min-w-0 flex-wrap gap-1', className)}
    >
      {values.map(({ id, name, option }) => (
        <li key={id} className="min-w-0">
          <Badge tone={option.color} title={name} className="h-5 max-w-40 px-2">
            <span className="sr-only">{t('issues.activity.field', { label: name })} </span>
            <span className="truncate">{option.name}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
