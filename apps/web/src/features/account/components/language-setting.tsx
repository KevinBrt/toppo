import { useMutation } from '@tanstack/react-query';
import { type Locale, localeSchema, SUPPORTED_LOCALES } from '@toppo/shared';
import { Alert, Select } from '@toppo/ui';
import { useId } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Account } from '../api/account.api.ts';

/** A language as it names itself, so that anyone finds theirs: English, Français. */
function nameOf(locale: Locale): string {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * The language Toppo speaks to the person, in the app and in its emails, the same on every
 * device: saved as soon as chosen, and spoken at once. Reports the new one.
 */
export function LanguageSetting({
  locale,
  onChanged,
}: {
  locale: Locale;
  onChanged: (locale: Locale) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const change = useMutation({
    mutationFn: (next: Locale) => Account.setLocale(next),
    onSuccess: (_, next) => onChanged(next),
  });

  return (
    <div className="flex flex-col gap-1.5">
      {change.isError ? <Alert tone="danger">{requestErrorMessage(change.error, t)}</Alert> : null}
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {t('account.language')}
      </label>
      <Select
        id={id}
        value={change.isPending ? change.variables : locale}
        disabled={change.isPending}
        onChange={(event) => change.mutate(localeSchema.parse(event.target.value))}
        className="sm:max-w-xs"
      >
        {SUPPORTED_LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {nameOf(option)}
          </option>
        ))}
      </Select>
    </div>
  );
}
