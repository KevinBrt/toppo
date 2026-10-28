import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PASSWORD_MIN_LENGTH, type SetupRequest, setupRequestSchema } from '@toppo-tracker/shared';
import { Alert, Button, Field, Input, PasswordInput } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Session } from '../api/session.api.ts';
import { EMPTY_SETUP_FORM, type SetupFormValues, toSetupRequest } from '../models/session.model.ts';
import { SessionQueries } from '../queries/session.queries.ts';

/**
 * First-run wizard: creates the administrator, then signs them in. Default data is written in
 * the language of the interface. The caller decides where to go once done.
 */
export function SetupForm({ onCompleted }: { onCompleted: () => Promise<void> | void }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SetupFormValues>(EMPTY_SETUP_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setup = useMutation({
    mutationFn: async (request: SetupRequest) => {
      await Session.completeSetup(request);
      queryClient.setQueryData(SessionQueries.setupRequired.queryKey, false);
      await Session.signIn(request.admin.email, request.admin.password);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: SessionQueries.currentUser.queryKey });
      await onCompleted();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = setupRequestSchema.safeParse(toSetupRequest(values, locale));
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      setup.mutate(parsed.data);
    }
  }

  const update = (field: keyof SetupFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form noValidate onSubmit={submit} aria-busy={setup.isPending} className="flex flex-col gap-5">
      {setup.isError ? (
        <Alert tone="danger">
          {requestErrorMessage(setup.error, t, {
            INVALID_SETUP_CODE: 'setup.invalidCode',
            SETUP_ALREADY_COMPLETED: 'setup.alreadyCompleted',
          })}
        </Alert>
      ) : null}
      <Field
        label={t('setup.setupCode')}
        required
        description={t('setup.setupCodeHelp')}
        error={errors['setupCode']}
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono tracking-wider"
            value={values.setupCode}
            onChange={update('setupCode')}
          />
        )}
      </Field>
      <Field label={t('setup.adminName')} required error={errors['admin.name']}>
        {(control) => (
          <Input {...control} autoComplete="name" value={values.name} onChange={update('name')} />
        )}
      </Field>
      <Field label={t('setup.email')} required error={errors['admin.email']}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={update('email')}
          />
        )}
      </Field>
      <Field
        label={t('setup.password')}
        required
        description={t('setup.passwordHelp', { min: PASSWORD_MIN_LENGTH })}
        error={errors['admin.password']}
      >
        {(control) => (
          <PasswordInput
            {...control}
            autoComplete="new-password"
            showLabel={t('password.show')}
            hideLabel={t('password.hide')}
            value={values.password}
            onChange={update('password')}
          />
        )}
      </Field>
      <Button type="submit" disabled={setup.isPending} className="mt-1 w-full">
        {setup.isPending ? t('setup.submitting') : t('setup.submit')}
      </Button>
    </form>
  );
}
