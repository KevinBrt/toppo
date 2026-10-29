import type { PluginHttpCall } from '@toppo-tracker/shared';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { HTTP_FAILURE_MESSAGES } from '../../constants/plugin-failures.constants.ts';
import { DetailsSection } from './details-section.tsx';

const CELL = 'px-3 py-2 align-top';

/**
 * The last requests a plugin sent outside Toppo, the latest first: where to and how each went,
 * never what it carried. For whoever manages it to see what it does.
 */
export function PluginHttpCalls({ calls }: { calls: readonly PluginHttpCall[] }) {
  const { t, locale } = useI18n();

  function result({ status, error }: PluginHttpCall) {
    if (status !== null) {
      return t('plugins.callAnswered', { status });
    }
    const message = error === null ? undefined : HTTP_FAILURE_MESSAGES.get(error);
    return message ? t(message) : (error ?? '');
  }

  return (
    <DetailsSection title={t('plugins.callsTitle')} description={t('plugins.callsDescription')}>
      {calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('plugins.callsNone')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('plugins.callsCaption')}</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('plugins.callsColumns.when')}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('plugins.callsColumns.request')}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {t('plugins.callsColumns.result')}
                </th>
                <th scope="col" className={`${CELL} text-right font-medium`}>
                  {t('plugins.callsColumns.duration')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {calls.map((call) => (
                <tr key={call.id}>
                  <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>
                    {formatDateTime(call.at, locale)}
                  </td>
                  <td className={`${CELL} break-all font-mono text-xs text-foreground`}>
                    {call.method} {call.host}
                  </td>
                  <td
                    className={`${CELL} ${call.error !== null || (call.status ?? 0) >= 400 ? 'text-danger' : 'text-foreground'}`}
                  >
                    {result(call)}
                  </td>
                  <td
                    className={`${CELL} whitespace-nowrap text-right tabular-nums text-muted-foreground`}
                  >
                    {t('plugins.callDuration', { ms: call.durationMs })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailsSection>
  );
}
