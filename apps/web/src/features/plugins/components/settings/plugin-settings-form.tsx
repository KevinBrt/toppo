import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { DetailsSection } from '../details/details-section.tsx';
import { SettingsForm } from './settings-form.tsx';

/**
 * A plugin's settings for the whole instance, on its page: usable whatever its state, since a
 * plugin is set up before it runs.
 */
export function PluginSettingsForm({ plugin }: { plugin: PluginDetailsResponse }) {
  const { t } = useI18n();
  const { fields, values, refused } = plugin.settings;

  return (
    <DetailsSection
      title={t('plugins.settingsTitle')}
      description={t('plugins.settingsDescription')}
    >
      <SettingsForm
        fields={fields}
        values={values}
        refused={refused ? t('plugins.settingsRefused') : null}
        save={(request) => Plugins.saveSettings(plugin.slug, request)}
      />
    </DetailsSection>
  );
}
