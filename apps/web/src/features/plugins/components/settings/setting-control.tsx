import type { Locale, PluginSettingField } from '@toppo-tracker/shared';
import { Field, Input, Select, Switch } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

const INPUT_TYPES = { text: 'text', url: 'url', email: 'email' } as const;

/**
 * One of a plugin's settings, drawn as its kind asks: a text (an address, an email), a number, a
 * yes or no, or a choice, named and explained in the plugin's words. Empty, it takes its default,
 * which it says.
 */
export function SettingControl({
  field,
  value,
  error,
  onChange,
}: {
  field: PluginSettingField;
  value: string | boolean | undefined;
  error: string | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const { t, locale } = useI18n();
  const defaultValue = shownDefault(field, locale);
  const description =
    [
      field.help?.[locale],
      defaultValue === null ? undefined : t('plugins.settingDefault', { value: defaultValue }),
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  const typed = typeof value === 'string' ? value : '';

  return (
    <Field label={field.label[locale]} description={description} error={error}>
      {(control) => {
        switch (field.kind) {
          case 'boolean':
            return <Switch {...control} checked={value === true} onCheckedChange={onChange} />;
          case 'choice': {
            const chosenByDefault = field.options.find(({ value }) => value === field.default);
            return (
              <Select {...control} value={typed} onChange={(event) => onChange(event.target.value)}>
                <option value="">
                  {chosenByDefault
                    ? t('plugins.settingDefaultOption', { value: chosenByDefault.label[locale] })
                    : t('plugins.settingNone')}
                </option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label[locale]}
                  </option>
                ))}
              </Select>
            );
          }
          case 'number':
            return (
              <Input
                {...control}
                value={typed}
                inputMode={field.integer ? 'numeric' : 'decimal'}
                onChange={(event) => onChange(event.target.value)}
              />
            );
          case 'text':
            return (
              <Input
                {...control}
                type={INPUT_TYPES[field.format]}
                value={typed}
                maxLength={field.maxLength ?? undefined}
                spellCheck={field.format === 'text'}
                onChange={(event) => onChange(event.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}

/** The default of a text or a number, as the form says it; a choice says its own in its list. */
function shownDefault(field: PluginSettingField, locale: Locale): string | null {
  if (field.kind === 'number' && field.default !== null) {
    return new Intl.NumberFormat(locale).format(field.default);
  }
  return field.kind === 'text' && field.default ? field.default : null;
}
