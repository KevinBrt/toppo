import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PLUGIN_EVENT_MESSAGES } from '../../constants/plugin-events.constants.ts';
import type { NeedLabel } from '../../models/plugin-page.model.ts';
import { DetailsSection } from './details-section.tsx';

/**
 * What a plugin declares, in plain words, for an administrator to approve it knowingly: what it
 * does in Toppo, the permissions it adds, and the events it listens to.
 */
export function PluginDeclarations({
  plugin,
  needLabel,
}: {
  plugin: PluginDetailsResponse;
  needLabel: NeedLabel;
}) {
  const { t, locale } = useI18n();

  return (
    <>
      <DetailsSection title={t('plugins.needsTitle')} description={t('plugins.needsDescription')}>
        <Sentences
          sentences={plugin.needs.map((need) => ({ key: need, text: needLabel(need) }))}
          empty={t('plugins.needsNone')}
        />
      </DetailsSection>
      <DetailsSection
        title={t('plugins.permissionsTitle')}
        description={t('plugins.permissionsDescription')}
      >
        {plugin.permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('plugins.permissionsNone')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {plugin.permissions.map((permission) => (
              <li
                key={permission.name}
                className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm text-foreground">{permission.label[locale]}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`plugins.scope.${permission.scope}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailsSection>
      <DetailsSection
        title={t('plugins.eventsTitle')}
        description={plugin.events.length > 0 ? t('plugins.eventsDescription') : undefined}
      >
        <Sentences
          sentences={plugin.events.map((event) => {
            const message = PLUGIN_EVENT_MESSAGES.get(event);
            return { key: event, text: message ? t(message) : event };
          })}
          empty={t('plugins.eventsNone')}
        />
      </DetailsSection>
    </>
  );
}

/** A list of short sentences, or a line saying there is none. */
function Sentences({
  sentences,
  empty,
}: {
  sentences: readonly { key: string; text: string }[];
  empty: string;
}) {
  if (sentences.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {sentences.map(({ key, text }) => (
        <li key={key} className="flex items-start gap-2.5 text-sm text-foreground">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {text}
        </li>
      ))}
    </ul>
  );
}
