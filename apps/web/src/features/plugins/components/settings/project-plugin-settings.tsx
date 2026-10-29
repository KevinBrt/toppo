import { useQuery } from '@tanstack/react-query';
import { Alert, EmptyState } from '@toppo-tracker/ui';
import { PuzzleIcon } from 'lucide-react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { DetailsSection } from '../details/details-section.tsx';
import { PluginLogo } from '../plugin-logo.tsx';
import { SettingsForm } from './settings-form.tsx';

/**
 * What a project sets for itself of each plugin at work in it that takes settings of it, one
 * form per plugin, saved once the plugin's own code accepts them.
 */
export function ProjectPluginSettings({ projectKey }: { projectKey: string }) {
  const { t, locale } = useI18n();
  const plugins = useQuery(PluginsQueries.inProject(projectKey));

  if (plugins.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('projectPlugins.loading')}
      </p>
    );
  }
  if (plugins.isError) {
    return <Alert tone="danger">{requestErrorMessage(plugins.error, t)}</Alert>;
  }
  if (plugins.data.length === 0) {
    return (
      <EmptyState
        icon={PuzzleIcon}
        title={t('projectPlugins.emptyTitle')}
        description={t('projectPlugins.emptyDescription')}
      />
    );
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {plugins.data.map((plugin) => (
        <DetailsSection
          key={plugin.slug}
          title={plugin.name[locale]}
          icon={<PluginLogo url={plugin.logoUrl} className="size-8" />}
        >
          <SettingsForm
            fields={plugin.fields}
            values={plugin.values}
            refused={plugin.refused ? t('projectPlugins.refused') : null}
            save={({ values }) => Plugins.saveProjectSettings(projectKey, plugin.slug, values)}
          />
        </DetailsSection>
      ))}
    </div>
  );
}
