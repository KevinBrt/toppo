import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type InvitationPreview,
  invitationTokenSchema,
  PASSWORD_MIN_LENGTH,
} from '@toppo-tracker/shared';
import { Alert, Button, Field, Input, PasswordInput } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Invitations } from '../../api/invitations.api.ts';
import {
  type AcceptInvitationFormValues,
  acceptInvitationFormSchema,
  EMPTY_ACCEPT_INVITATION_FORM,
} from '../../models/invitation.model.ts';
import { UsersQueries } from '../../queries/users.queries.ts';

const KNOWN_ERRORS = {
  INVITATION_INVALID: 'invitation.invalid',
  INVITATION_EXPIRED: 'invitation.expired',
  ALREADY_MEMBER: 'invitation.alreadyMember',
} as const;

/**
 * Opening an invitation link: says whom it is for, then lets the person choose a name and a
 * password. Reports the address to sign in with; the caller decides where to go.
 */
export function AcceptInvitation({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: (email: string) => void;
}) {
  const { t } = useI18n();
  const wellFormed = invitationTokenSchema.safeParse(token).success;
  const preview = useQuery({ ...UsersQueries.invitationPreview(token), enabled: wellFormed });

  if (!wellFormed) {
    return <Alert tone="danger">{t('invitation.invalid')}</Alert>;
  }
  if (preview.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('invitation.loading')}
      </p>
    );
  }
  if (preview.isError) {
    return <Alert tone="danger">{requestErrorMessage(preview.error, t, KNOWN_ERRORS)}</Alert>;
  }
  return <AcceptInvitationForm token={token} preview={preview.data} onAccepted={onAccepted} />;
}

function AcceptInvitationForm({
  token,
  preview,
  onAccepted,
}: {
  token: string;
  preview: InvitationPreview;
  onAccepted: (email: string) => void;
}) {
  const { t, locale } = useI18n();
  const [values, setValues] = useState<AcceptInvitationFormValues>(EMPTY_ACCEPT_INVITATION_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const accept = useMutation({
    mutationFn: (form: AcceptInvitationFormValues) =>
      Invitations.accept({ token, ...form, locale }),
    onSuccess: onAccepted,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = acceptInvitationFormSchema.safeParse(values);
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      accept.mutate(parsed.data);
    }
  }

  const update =
    (field: keyof AcceptInvitationFormValues) => (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form noValidate onSubmit={submit} aria-busy={accept.isPending} className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {preview.invitedBy === null
          ? t('invitation.introAnonymous', { email: preview.email })
          : t('invitation.intro', { name: preview.invitedBy, email: preview.email })}
      </p>
      {accept.isError ? (
        <Alert tone="danger">{requestErrorMessage(accept.error, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      {/* Read only: lets password managers file the new password under this address. */}
      <Field label={t('login.email')}>
        {(control) => (
          <Input {...control} type="email" autoComplete="username" value={preview.email} readOnly />
        )}
      </Field>
      <Field label={t('invitation.name')} required error={errors['name']}>
        {(control) => (
          <Input {...control} autoComplete="name" value={values.name} onChange={update('name')} />
        )}
      </Field>
      <Field
        label={t('invitation.password')}
        required
        description={t('invitation.passwordHelp', { min: PASSWORD_MIN_LENGTH })}
        error={errors['password']}
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
      <Button type="submit" disabled={accept.isPending} className="mt-1 w-full">
        {accept.isPending ? t('invitation.submitting') : t('invitation.submit')}
      </Button>
    </form>
  );
}
