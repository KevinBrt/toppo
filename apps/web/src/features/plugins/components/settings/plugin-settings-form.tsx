import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginDetailsResponse, PluginSettingValues } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { SETTINGS_ERRORS } from '../../constants/plugin-errors.constants.ts';
import { settingsForm, settingsRequest } from '../../models/plugin-settings-form.model.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { DetailsSection } from '../details/details-section.tsx';
import { SettingControl } from './setting-control.tsx';

/**
 * A plugin's settings, its form drawn from what its code declares, saved once its code accepts
 * them; it says which it refused. Usable whatever its state: a plugin is set up before it runs.
 */
export function PluginSettingsForm({ plugin }: { plugin: PluginDetailsResponse }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { fields, values, refused } = plugin.settings;
  const [form, setForm] = useState(() => settingsForm(fields, values));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (request: PluginSettingValues) => Plugins.saveSettings(plugin.slug, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'PLUGIN_SETTINGS_INVALID') {
        setErrors(
          Object.fromEntries(error.details.map(({ path }) => [path, t('plugins.settingRefused')])),
        );
      }
    },
  });

  function edit(name: string, value: string | boolean) {
    setForm({ ...form, [name]: value });
    setErrors(({ [name]: _fixed, ...others }) => others);
    save.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = settingsRequest(fields, form, t);
    setErrors(request.errors);
    if (Object.keys(request.errors).length === 0) {
      save.mutate(request.values);
    }
  }

  return (
    <DetailsSection
      title={t('plugins.settingsTitle')}
      description={t('plugins.settingsDescription')}
    >
      <form noValidate onSubmit={submit} aria-busy={save.isPending} className="flex flex-col gap-5">
        {refused ? <Alert tone="danger">{t('plugins.settingsRefused')}</Alert> : null}
        {save.isError ? (
          <Alert tone="danger">{requestErrorMessage(save.error, t, SETTINGS_ERRORS)}</Alert>
        ) : null}
        {fields.map((field) => (
          <SettingControl
            key={field.name}
            field={field}
            value={form[field.name]}
            error={errors[field.name]}
            onChange={(value) => edit(field.name, value)}
          />
        ))}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {save.isSuccess ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('plugins.settingsSaved')}
            </p>
          ) : null}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('plugins.saving') : t('plugins.saveSettings')}
          </Button>
        </div>
      </form>
    </DetailsSection>
  );
}
