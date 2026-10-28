import { BULK_REFUSALS, type BulkIssuesResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { BulkChange } from '../../models/bulk-change.model.ts';

/**
 * What an action on several issues did: how many it changed or deleted, or that there was nothing
 * to change; then the issues it could not take, by reason.
 */
export function BulkOutcome({
  action,
  outcome,
}: {
  action: BulkChange['action'];
  outcome: BulkIssuesResponse;
}) {
  const { t, locale } = useI18n();
  const count = outcome.changed.length;
  const done = action === 'delete' ? 'deleted' : 'changed';
  const keys = (code: (typeof BULK_REFUSALS)[number]) =>
    outcome.refused.filter((refusal) => refusal.code === code).map(({ key }) => key);

  return (
    <Alert>
      <span className="flex flex-col gap-1">
        {count > 0 || outcome.refused.length > 0 ? (
          <span>{t(`issues.bulk.${done}.${pluralForm(locale, count)}`, { count })}</span>
        ) : (
          <span>{t('issues.bulk.unchanged')}</span>
        )}
        {BULK_REFUSALS.map((code) =>
          keys(code).length > 0 ? (
            <span key={code}>
              {t(`issues.bulk.refused.${code}`, {
                keys: new Intl.ListFormat(locale, { type: 'conjunction' }).format(keys(code)),
              })}
            </span>
          ) : null,
        )}
      </span>
    </Alert>
  );
}
