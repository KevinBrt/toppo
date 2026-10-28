import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PluginSettingField,
  PluginSettingValue,
  PluginSettingValues,
} from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { SETTINGS_ERRORS } from '../../constants/plugin-errors.constants.ts';
import { settingsForm, settingsRequest } from '../../models/plugin-settings-form.model.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { SettingControl } from './setting-control.tsx';

/**
 * A plugin's settings, the instance's or a project's: its form drawn from what its code declares,
 * saved once its code accepts them, saying which it refused. Says so when an upgrade refuses those
 * saved.
 */
export function SettingsForm({
  fields,
  values,
  refused,
  save,
}: {
  fields: readonly PluginSettingField[];
  values: Readonly<Record<string, PluginSettingValue>>;
  /** What to say when an upgrade refuses the settings saved; `null` when it takes them. */
  refused: string | null;
  save: (values: PluginSettingValues) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => settingsForm(fields, values, locale));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saving = useMutation({
    mutationFn: save,
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
    saving.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = settingsRequest(fields, form, t);
    setErrors(request.errors);
    if (Object.keys(request.errors).length === 0) {
      saving.mutate(request.values);
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={saving.isPending} className="flex flex-col gap-5">
      {refused ? <Alert tone="danger">{refused}</Alert> : null}
      {saving.isError ? (
        <Alert tone="danger">{requestErrorMessage(saving.error, t, SETTINGS_ERRORS)}</Alert>
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
        {saving.isSuccess ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('plugins.settingsSaved')}
          </p>
        ) : null}
        <Button type="submit" disabled={saving.isPending}>
          {saving.isPending ? t('plugins.saving') : t('plugins.saveSettings')}
        </Button>
      </div>
    </form>
  );
}
