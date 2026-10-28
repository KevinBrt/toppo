import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Field, Input, PasswordInput } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import type { z } from 'zod';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Session } from '../api/session.api.ts';
import {
  EMPTY_LOGIN_FORM,
  type LoginFormValues,
  loginFormSchema,
} from '../models/session.model.ts';
import { SessionQueries } from '../queries/session.queries.ts';

/** Email and password sign-in. The caller decides where to go once signed in. */
export function LoginForm({
  defaultEmail = '',
  onSignedIn,
}: {
  /** Filled in for someone who just created their account. */
  defaultEmail?: string;
  onSignedIn: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<LoginFormValues>({
    ...EMPTY_LOGIN_FORM,
    email: defaultEmail,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const login = useMutation({
    mutationFn: ({ email, password }: z.output<typeof loginFormSchema>) =>
      Session.signIn(email, password),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: SessionQueries.currentUser.queryKey });
      await onSignedIn();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginFormSchema.safeParse(values);
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      login.mutate(parsed.data);
    }
  }

  const update = (field: keyof LoginFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form noValidate onSubmit={submit} aria-busy={login.isPending} className="flex flex-col gap-5">
      {login.isError ? (
        <Alert tone="danger">
          {requestErrorMessage(login.error, t, {
            INVALID_EMAIL_OR_PASSWORD: 'login.invalidCredentials',
            ACCOUNT_DEACTIVATED: 'login.accountDeactivated',
          })}
        </Alert>
      ) : null}
      <Field label={t('login.email')} required error={errors['email']}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="username"
            value={values.email}
            onChange={update('email')}
          />
        )}
      </Field>
      <Field label={t('login.password')} required error={errors['password']}>
        {(control) => (
          <PasswordInput
            {...control}
            autoComplete="current-password"
            showLabel={t('password.show')}
            hideLabel={t('password.hide')}
            value={values.password}
            onChange={update('password')}
          />
        )}
      </Field>
      <Button type="submit" disabled={login.isPending} className="mt-1 w-full">
        {login.isPending ? t('login.submitting') : t('login.submit')}
      </Button>
    </form>
  );
}
