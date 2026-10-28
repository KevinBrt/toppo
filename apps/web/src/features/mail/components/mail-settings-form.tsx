import { useMutation } from '@tanstack/react-query';
import {
  MAIL_SECURITY,
  type MailSecurity,
  type MailSettings,
  type MailSettingsRequest,
  mailSettingsRequestSchema,
} from '@toppo-tracker/shared';
import { Alert, Button, Field, Input, PasswordInput, Select } from '@toppo-tracker/ui';
import { SendIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Mail } from '../api/mail.api.ts';
import { MAIL_ERRORS } from '../constants/mail.constants.ts';
import { type MailForm, mailForm, mailRequest, withSecurity } from '../models/mail-form.model.ts';

const SECURITY_LABELS = {
  starttls: 'mail.securityStarttls',
  tls: 'mail.securityTls',
  none: 'mail.securityNone',
} as const satisfies Record<MailSecurity, string>;

/**
 * The mail server and the sender, saved together; then a test email, sent to oneself with the
 * settings saved, which says why the server refused it if it did. Reports each save.
 */
export function MailSettingsForm({
  settings,
  email,
  onSaved,
}: {
  settings: MailSettings | null;
  /** The administrator's own address, where the test email goes. */
  email: string;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => mailForm(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Tests read the settings saved: changes not saved yet would not be tested.
  const [dirty, setDirty] = useState(false);
  const save = useMutation({
    mutationFn: (request: MailSettingsRequest) => Mail.save(request),
    onSuccess: async () => {
      setForm((current) => ({ ...current, password: '' }));
      setDirty(false);
      await onSaved();
    },
  });
  const test = useMutation({ mutationFn: () => Mail.sendTest() });

  function edit(next: MailForm) {
    setForm(next);
    setDirty(true);
    save.reset();
    test.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = mailSettingsRequestSchema.safeParse(mailRequest(form));
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      save.mutate(parsed.data);
    }
  }

  const signsIn = form.username.trim() !== '';
  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={submit} aria-busy={save.isPending} className="flex flex-col gap-6">
        {save.isError ? (
          <Alert tone="danger">{requestErrorMessage(save.error, t, MAIL_ERRORS)}</Alert>
        ) : null}
        {save.isSuccess ? <Alert>{t('mail.saved')}</Alert> : null}
        <Section title={t('mail.server')} description={t('mail.serverDescription')}>
          <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
            <Field label={t('mail.host')} required error={errors['host']}>
              {(control) => (
                <Input
                  {...control}
                  value={form.host}
                  placeholder={t('mail.hostPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={253}
                  onChange={(event) => edit({ ...form, host: event.target.value })}
                />
              )}
            </Field>
            <Field label={t('mail.port')} required error={errors['port']}>
              {(control) => (
                <Input
                  {...control}
                  value={form.port}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={(event) => edit({ ...form, port: event.target.value })}
                />
              )}
            </Field>
          </div>
          <Field label={t('mail.security')}>
            {(control) => (
              <Select
                {...control}
                value={form.security}
                onChange={(event) => {
                  const security = MAIL_SECURITY.find((value) => value === event.target.value);
                  if (security) {
                    edit(withSecurity(form, security));
                  }
                }}
              >
                {MAIL_SECURITY.map((security) => (
                  <option key={security} value={security}>
                    {t(SECURITY_LABELS[security])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t('mail.username')}
            description={t('mail.usernameHelp')}
            error={errors['username']}
          >
            {(control) => (
              <Input
                {...control}
                value={form.username}
                autoComplete="off"
                spellCheck={false}
                maxLength={320}
                onChange={(event) => edit({ ...form, username: event.target.value })}
              />
            )}
          </Field>
          {signsIn ? (
            <Field
              label={t('mail.password')}
              description={settings?.passwordSet ? t('mail.passwordKept') : undefined}
              error={errors['password']}
            >
              {(control) => (
                <PasswordInput
                  {...control}
                  value={form.password}
                  autoComplete="new-password"
                  maxLength={1000}
                  showLabel={t('password.show')}
                  hideLabel={t('password.hide')}
                  onChange={(event) => edit({ ...form, password: event.target.value })}
                />
              )}
            </Field>
          ) : null}
        </Section>
        <Section title={t('mail.sender')} description={t('mail.senderDescription')}>
          <Field label={t('mail.fromAddress')} required error={errors['fromAddress']}>
            {(control) => (
              <Input
                {...control}
                type="email"
                value={form.fromAddress}
                placeholder={t('mail.fromAddressPlaceholder')}
                maxLength={254}
                onChange={(event) => edit({ ...form, fromAddress: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('mail.fromName')} required error={errors['fromName']}>
            {(control) => (
              <Input
                {...control}
                value={form.fromName}
                maxLength={100}
                onChange={(event) => edit({ ...form, fromName: event.target.value })}
              />
            )}
          </Field>
        </Section>
        <Button type="submit" disabled={save.isPending} className="self-end">
          {save.isPending ? t('mail.saving') : t('mail.save')}
        </Button>
      </form>
      <Section title={t('mail.testTitle')} description={t('mail.testHelp', { email })}>
        {test.isSuccess ? <Alert>{t('mail.testSent', { email })}</Alert> : null}
        {test.isError ? (
          <Alert tone="danger">{requestErrorMessage(test.error, t, MAIL_ERRORS)}</Alert>
        ) : null}
        {settings && dirty ? (
          <p className="text-sm text-muted-foreground">{t('mail.testAfterSaving')}</p>
        ) : null}
        <Button
          variant="secondary"
          disabled={!settings || dirty || test.isPending}
          onClick={() => test.mutate()}
          className="self-start"
        >
          <SendIcon aria-hidden="true" />
          {test.isPending ? t('mail.testing') : t('mail.test')}
        </Button>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
