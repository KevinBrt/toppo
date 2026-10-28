import { useMutation } from '@tanstack/react-query';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@toppo-tracker/shared';
import { Alert, Button, Field, PasswordInput } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { ApiRequestError } from '../../../shared/api/http.client.ts';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Account } from '../api/account.api.ts';

const EMPTY: ChangePasswordRequest = { currentPassword: '', newPassword: '' };

/** The current password, then a new one. Other devices are signed out once it is changed. */
export function PasswordForm({ email }: { email: string }) {
  const { t } = useI18n();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = useMutation({
    mutationFn: (passwords: ChangePasswordRequest) => Account.changePassword(passwords),
    onSuccess: () => setValues(EMPTY),
    onError: (error) => {
      // The one refusal tied to a field: say it there.
      if (error instanceof ApiRequestError && error.code === 'INVALID_PASSWORD') {
        setErrors({ currentPassword: t('account.wrongPassword') });
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = changePasswordRequestSchema.safeParse(values);
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      change.mutate(parsed.data);
    }
  }

  function edit(field: keyof ChangePasswordRequest, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    change.reset();
  }

  const refusedOutsideFields =
    change.isError &&
    !(change.error instanceof ApiRequestError && change.error.code === 'INVALID_PASSWORD');
  return (
    <form noValidate onSubmit={submit} aria-busy={change.isPending} className="flex flex-col gap-5">
      {refusedOutsideFields ? (
        <Alert tone="danger">{requestErrorMessage(change.error, t)}</Alert>
      ) : null}
      {change.isSuccess ? <Alert>{t('account.passwordChanged')}</Alert> : null}
      {/* Tells password managers whose password this is. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label={t('account.currentPassword')} required error={errors['currentPassword']}>
        {(control) => (
          <PasswordInput
            {...control}
            value={values.currentPassword}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="current-password"
            showLabel={t('password.show')}
            hideLabel={t('password.hide')}
            onChange={(event) => edit('currentPassword', event.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('account.newPassword')}
        required
        description={t('account.newPasswordHelp', { min: PASSWORD_MIN_LENGTH })}
        error={errors['newPassword']}
      >
        {(control) => (
          <PasswordInput
            {...control}
            value={values.newPassword}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            showLabel={t('password.show')}
            hideLabel={t('password.hide')}
            onChange={(event) => edit('newPassword', event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" disabled={change.isPending} className="self-end">
        {change.isPending ? t('account.changingPassword') : t('account.changePassword')}
      </Button>
    </form>
  );
}
