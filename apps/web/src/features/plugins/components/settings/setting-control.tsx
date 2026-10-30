import type { Locale, PluginSettingField } from '@toppo-tracker/shared';
import { Field, type FieldControlProps, Input, Select, Switch } from '@toppo-tracker/ui';
import type { Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

const INPUT_TYPES = { text: 'text', url: 'url', email: 'email' } as const;

/**
 * One of a plugin's settings, drawn as its kind asks: a text (an address, an email), a number, a
 * yes or no, or a choice, named and explained in the plugin's words. Empty, it takes its default,
 * which it says. A secret is typed blind, never shown again; once kept, it may be removed.
 */
export function SettingControl({
  field,
  value,
  error,
  onChange,
  cleared,
  onClear,
}: {
  field: PluginSettingField;
  value: string | boolean | undefined;
  error: string | undefined;
  onChange: (value: string | boolean) => void;
  /** A secret kept, marked to be removed. */
  cleared: boolean;
  onClear: (removed: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const defaultValue = shownDefault(field, locale);
  const description =
    [
      field.help?.[locale],
      defaultValue === null ? undefined : t('plugins.settingDefault', { value: defaultValue }),
      secretNote(field, t),
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
            return field.secret ? (
              <SecretInput
                control={control}
                label={field.label[locale]}
                set={field.secret.set}
                value={typed}
                cleared={cleared}
                onChange={onChange}
                onClear={onClear}
              />
            ) : (
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

/** A secret, typed blind; once kept, kept unless typed anew or removed. */
function SecretInput({
  control,
  label,
  set,
  value,
  cleared,
  onChange,
  onClear,
}: {
  control: FieldControlProps;
  label: string;
  set: boolean;
  value: string;
  cleared: boolean;
  onChange: (value: string) => void;
  onClear: (removed: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <Input
        {...control}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        value={value}
        disabled={cleared}
        onChange={(event) => onChange(event.target.value)}
      />
      {set ? (
        <label className="flex items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11">
          <input
            type="checkbox"
            checked={cleared}
            onChange={(event) => onClear(event.target.checked)}
            className="size-4 accent-primary"
          />
          {t('plugins.secretRemove', { setting: label })}
        </label>
      ) : null}
    </div>
  );
}

/** What a secret's field says of it: kept and never shown, or kept once saved. */
function secretNote(field: PluginSettingField, t: Translate): string | undefined {
  if (field.kind !== 'text' || field.secret === null) {
    return undefined;
  }
  return field.secret.set ? t('plugins.secretSet') : t('plugins.secretUnset');
}

/** The default of a text or a number, as the form says it; a choice says its own in its list. */
function shownDefault(field: PluginSettingField, locale: Locale): string | null {
  if (field.kind === 'number' && field.default !== null) {
    return new Intl.NumberFormat(locale).format(field.default);
  }
  return field.kind === 'text' && field.default ? field.default : null;
}
