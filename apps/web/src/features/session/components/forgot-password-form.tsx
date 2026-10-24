import { useMutation } from '@tanstack/react-query';
import { PASSWORD_RESET_LIFETIME_MINUTES, passwordResetRequestSchema } from '@toppo/shared';
import { Alert, Button, Field, Input } from '@toppo/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Session } from '../api/session.api.ts';

/**
 * Asks for a link to choose a new password. The answer is the same whether the address has an
 * account or not: the page says only that a link is on its way if it does.
 */
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const request = useMutation({
    mutationFn: (address: string) => Session.requestPasswordReset(address),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = passwordResetRequestSchema.safeParse({ email });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      request.mutate(parsed.data.email);
    }
  }

  if (request.isSuccess) {
    return (
      <Alert tone="info">
        {t('passwordReset.sent', {
          email: request.variables,
          minutes: PASSWORD_RESET_LIFETIME_MINUTES,
        })}
      </Alert>
    );
  }
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-busy={request.isPending}
      className="flex flex-col gap-5"
    >
      {request.isError ? (
        <Alert tone="danger">{requestErrorMessage(request.error, t)}</Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">{t('passwordReset.requestDescription')}</p>
      <Field label={t('login.email')} required error={errors['email']}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" disabled={request.isPending} className="mt-1 w-full">
        {request.isPending ? t('passwordReset.sending') : t('passwordReset.send')}
      </Button>
    </form>
  );
}
