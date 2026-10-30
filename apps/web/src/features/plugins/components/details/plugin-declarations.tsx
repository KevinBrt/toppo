import type { Locale, PluginDetailsResponse } from '@toppo-tracker/shared';
import type { Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ISSUE_EVENT_MESSAGES } from '../../../../shared/i18n/issue-events.constants.ts';
import type { NeedLabel } from '../../models/plugin-page.model.ts';
import { DetailsSection } from './details-section.tsx';
import { PluginRoutes } from './plugin-routes.tsx';

/**
 * What a plugin declares, in plain words, for an administrator to approve it knowingly: what it
 * does in Toppo, the permissions it adds, the properties it adds to issues, the events it
 * listens to, what it reaches outside Toppo, and what it does on its own.
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
        title={t('plugins.propertiesTitle')}
        description={plugin.properties.length > 0 ? t('plugins.propertiesDescription') : undefined}
      >
        {plugin.properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('plugins.propertiesNone')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {plugin.properties.map((property) => (
              <li
                key={property.name.en}
                className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm text-foreground">{property.name[locale]}</span>
                <span className="text-xs text-muted-foreground">
                  {t('plugins.propertyKind', {
                    type:
                      property.display === 'duration'
                        ? t('plugins.durationType')
                        : t(`properties.types.${property.type}`),
                    writer: t(`plugins.propertyWrittenBy.${property.writtenBy}`),
                  })}
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
            const message = ISSUE_EVENT_MESSAGES.get(event);
            return { key: event, text: message ? t(message) : event };
          })}
          empty={t('plugins.eventsNone')}
        />
      </DetailsSection>
      <DetailsSection
        title={t('plugins.httpTitle')}
        description={plugin.http ? t('plugins.httpDescription') : undefined}
      >
        <Sentences sentences={reached(plugin.http, locale, t)} empty={t('plugins.httpNone')} />
      </DetailsSection>
      <PluginRoutes routes={plugin.routes} />
      <DetailsSection
        title={t('plugins.jobsTitle')}
        description={plugin.jobs.length > 0 ? t('plugins.jobsDescription') : undefined}
      >
        <Sentences
          sentences={plugin.jobs.map((job) => ({
            key: job.name,
            text: t('plugins.jobLine', {
              job: job.label[locale],
              every: t(`plugins.jobEvery.${job.every}`),
            }),
          }))}
          empty={t('plugins.jobsNone')}
        />
      </DetailsSection>
    </>
  );
}

/** Where it may send requests, one sentence each: a site, a setting's address, any site. */
function reached(
  http: PluginDetailsResponse['http'],
  locale: Locale,
  t: Translate,
): { key: string; text: string }[] {
  switch (http?.kind) {
    case 'hosts':
      return http.hosts.map((host) => ({ key: host, text: t('plugins.httpHost', { host }) }));
    case 'settings':
      return http.settings.map((setting) => ({
        key: setting.en,
        text: t('plugins.httpSetting', { setting: setting[locale] }),
      }));
    case 'any':
      return [{ key: 'any', text: t('plugins.httpAny') }];
    default:
      return [];
  }
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
