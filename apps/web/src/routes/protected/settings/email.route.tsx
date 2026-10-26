import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { can } from '@toppo/core';
import { Alert } from '@toppo/ui';
import { useState } from 'react';
import { MailSettingsForm } from '../../../features/mail/components/mail-settings-form.tsx';
import { TurnOffMail } from '../../../features/mail/components/turn-off-mail.tsx';
import { MailQueries } from '../../../features/mail/queries/mail.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { settingsRoute } from './settings.route.tsx';

/** How the instance sends email: invitations, password resets and notifications. */
export const emailRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'email',
  staticData: { titleKey: 'mail.title' },
  component: EmailScreen,
});

function EmailScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const allowed = Boolean(user && can(user.permissions, 'instance.mail.manage'));
  const settings = useQuery({ ...MailQueries.settings, enabled: allowed });
  // Once email is turned off, the form starts over, empty.
  const [round, setRound] = useState(0);

  if (!(user && allowed)) {
    return (
      <Page title={t('mail.title')}>
        <AccessDenied />
      </Page>
    );
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: MailQueries.settings.queryKey });
  return (
    <Page title={t('mail.title')} description={t('mail.description')}>
      {settings.isError ? (
        <Alert tone="danger">{requestErrorMessage(settings.error, t)}</Alert>
      ) : null}
      {settings.isSuccess ? (
        <div className="flex max-w-2xl flex-col gap-6">
          {settings.data === null ? <Alert>{t('mail.notConfigured')}</Alert> : null}
          <MailSettingsForm
            key={round}
            settings={settings.data}
            email={user.email}
            onSaved={refresh}
          />
          {settings.data ? (
            <TurnOffMail
              onTurnedOff={async () => {
                await refresh();
                setRound(round + 1);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </Page>
  );
}
