import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { NeedLabel, ProjectPickerSlot } from '../../models/plugin-page.model.ts';
import { isStopped } from '../../utils/plugin-state.util.ts';
import { PluginSettingsForm } from '../settings/plugin-settings-form.tsx';
import { RefusedProjectsAlert } from '../settings/refused-projects-alert.tsx';
import { PluginDeclarations } from './plugin-declarations.tsx';
import { PluginHeader } from './plugin-header.tsx';
import { PluginManagement } from './plugin-management.tsx';
import { PluginReachForm } from './plugin-reach-form.tsx';
import { PluginStoppedAlert } from './plugin-stopped-alert.tsx';

/**
 * A plugin's page: what it is and declares, in plain words, its settings, where it acts, and what
 * to do with it. Reports a plugin installed from it and this one uninstalled; the screen decides where to go.
 */
export function PluginDetails({
  plugin,
  projectPicker,
  needLabel,
  onInstalled,
  onUninstalled,
}: {
  plugin: PluginDetailsResponse;
  projectPicker: ProjectPickerSlot;
  needLabel: NeedLabel;
  onInstalled: (slug: string) => Promise<void> | void;
  onUninstalled: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const stopped = isStopped(plugin);
  const failure = stopped ? plugin.lastFailure : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PluginHeader plugin={plugin} />
      {failure ? (
        <PluginStoppedAlert slug={plugin.slug} failures={plugin.failures} reason={failure.reason} />
      ) : null}
      {plugin.approval === null ? <Alert>{t('plugins.pendingHelp')}</Alert> : null}
      {plugin.settings.refusedProjects.length > 0 ? (
        <RefusedProjectsAlert projects={plugin.settings.refusedProjects} />
      ) : null}
      <PluginDeclarations plugin={plugin} needLabel={needLabel} />
      {/* Set up before it runs; a new version starts the form over, from what it takes. */}
      {plugin.settings.fields.length > 0 ? (
        <PluginSettingsForm key={`settings:${plugin.packageSha256}`} plugin={plugin} />
      ) : null}
      {/* A new version starts the form over, from what it was approved for. */}
      <PluginReachForm key={plugin.packageSha256} plugin={plugin} projectPicker={projectPicker} />
      <PluginManagement
        plugin={plugin}
        stopped={stopped}
        onInstalled={onInstalled}
        onUninstalled={onUninstalled}
      />
    </div>
  );
}
