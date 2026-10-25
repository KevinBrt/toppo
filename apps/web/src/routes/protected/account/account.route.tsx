import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { EmailNotificationsSetting } from '../../../features/account/components/email-notifications-setting.tsx';
import { LanguageSetting } from '../../../features/account/components/language-setting.tsx';
import { PasswordForm } from '../../../features/account/components/password-form.tsx';
import { ProfileForm } from '../../../features/account/components/profile-form.tsx';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { protectedRoute } from '../protected.route.tsx';

export const accountRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/account',
  staticData: { titleKey: 'account.title' },
  component: AccountScreen,
});

function AccountScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(SessionQueries.currentUser);
  // Whether a forgotten password can be reset by email tells whether email is set up at all.
  const { data: emailSetUp } = useQuery(SessionQueries.passwordReset);
  const refreshUser = () =>
    queryClient.invalidateQueries({ queryKey: SessionQueries.currentUser.queryKey });

  if (!user) {
    return null;
  }
  return (
    <Page title={t('account.title')}>
      <div className="flex max-w-2xl flex-col gap-6">
        <Section title={t('account.profile')} description={t('account.profileDescription')}>
          <ProfileForm
            user={user}
            // The new name shows at once in the sidebar.
            onSaved={refreshUser}
          />
        </Section>
        <Section title={t('account.language')} description={t('account.languageDescription')}>
          <LanguageSetting
            locale={user.locale}
            // The whole interface speaks it at once: it reads the language of the session.
            onChanged={(locale) =>
              queryClient.setQueryData(SessionQueries.currentUser.queryKey, (current) =>
                current ? { ...current, locale } : current,
              )
            }
          />
        </Section>
        <Section
          title={t('account.notifications')}
          description={t('account.notificationsDescription')}
        >
          <EmailNotificationsSetting
            emailed={user.emailedEvents}
            emailSetUp={emailSetUp}
            onChanged={refreshUser}
          />
        </Section>
        <Section title={t('account.password')} description={t('account.passwordDescription')}>
          <PasswordForm email={user.email} />
        </Section>
      </div>
    </Page>
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
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
