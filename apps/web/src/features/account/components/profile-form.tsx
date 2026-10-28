import { useMutation } from '@tanstack/react-query';
import { type CurrentUser, updateAccountRequestSchema } from '@toppo-tracker/shared';
import { Alert, Button, Field, Input } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Account } from '../api/account.api.ts';

/** One's name, and the address one signs in with. Reports a saved name. */
export function ProfileForm({
  user,
  onSaved,
}: {
  user: CurrentUser;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(user.name);
  const [nameError, setNameError] = useState<string>();

  const save = useMutation({
    mutationFn: (account: { name: string }) => Account.update(account),
    onSuccess: onSaved,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateAccountRequestSchema.safeParse({ name });
    setNameError(parsed.success ? undefined : fieldErrors(parsed.error, t)['name']);
    if (parsed.success) {
      save.mutate(parsed.data);
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={save.isPending} className="flex flex-col gap-5">
      {save.isError ? <Alert tone="danger">{requestErrorMessage(save.error, t)}</Alert> : null}
      {save.isSuccess ? <Alert>{t('account.nameSaved')}</Alert> : null}
      <Field label={t('account.name')} required error={nameError}>
        {(control) => (
          <Input
            {...control}
            value={name}
            autoComplete="name"
            onChange={(event) => {
              setName(event.target.value);
              save.reset();
            }}
          />
        )}
      </Field>
      <Field label={t('account.email')} description={t('account.emailHelp')}>
        {(control) => (
          <Input
            {...control}
            type="email"
            value={user.email}
            readOnly
            className="bg-surface-muted text-muted-foreground"
          />
        )}
      </Field>
      <Button type="submit" disabled={save.isPending} className="self-end">
        {save.isPending ? t('account.savingName') : t('account.saveName')}
      </Button>
    </form>
  );
}
