import { useMutation } from '@tanstack/react-query';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
} from '@toppo-tracker/shared';
import { Alert, Button, Field, PasswordInput } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Session } from '../api/session.api.ts';

/** A new password, with the token of the link emailed. Reports it once changed. */
export function ResetPasswordForm({
  token,
  onReset,
}: {
  /** From the link, after `#`. */
  token: string;
  onReset: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reset = useMutation({
    mutationFn: (request: ResetPasswordRequest) => Session.resetPassword(request),
    onSuccess: onReset,
  });

  // A link cut short, or the page opened without one: nothing to try.
  if (!resetPasswordRequestSchema.shape.token.safeParse(token).success) {
    return <Alert tone="danger">{t('passwordReset.invalidLink')}</Alert>;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordRequestSchema.safeParse({ token, newPassword });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      reset.mutate(parsed.data);
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={reset.isPending} className="flex flex-col gap-5">
      {reset.isError ? (
        <Alert tone="danger">
          {requestErrorMessage(reset.error, t, { INVALID_RESET_LINK: 'passwordReset.invalidLink' })}
        </Alert>
      ) : null}
      <Field
        label={t('passwordReset.newPassword')}
        required
        description={t('passwordReset.newPasswordHelp', { min: PASSWORD_MIN_LENGTH })}
        error={errors['newPassword']}
      >
        {(control) => (
          <PasswordInput
            {...control}
            value={newPassword}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            showLabel={t('password.show')}
            hideLabel={t('password.hide')}
            onChange={(event) => {
              setNewPassword(event.target.value);
              reset.reset();
            }}
          />
        )}
      </Field>
      <Button type="submit" disabled={reset.isPending} className="mt-1 w-full">
        {reset.isPending ? t('passwordReset.saving') : t('passwordReset.save')}
      </Button>
    </form>
  );
}
