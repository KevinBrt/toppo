import { useQuery } from '@tanstack/react-query';
import { createRoute, Link, redirect, useRouter, useRouterState } from '@tanstack/react-router';
import { Alert } from '@toppo-tracker/ui';
import { z } from 'zod';
import { LoginForm } from '../../features/session/components/login-form.tsx';
import { loadSession, SessionQueries } from '../../features/session/queries/session.queries.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { AuthLayout } from '../../shared/layout/auth-layout.tsx';
import { rootRoute } from '../root.route.tsx';

/**
 * Where to go after signing in. Only same-site paths: `//evil.com` and `/\evil.com` are
 * protocol-relative URLs to another site, so they are dropped (no open redirect).
 */
const loginSearchSchema = z.object({
  redirect: z
    .string()
    .regex(/^\/(?![/\\])/)
    .optional()
    .catch(undefined),
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const { setupRequired, user } = await loadSession(context.queryClient);
    if (setupRequired) {
      throw redirect({ to: '/setup', replace: true });
    }
    if (user) {
      throw redirect({ to: search.redirect ?? '/issues', replace: true });
    }
  },
  component: LoginScreen,
});

function LoginScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { redirect: target } = loginRoute.useSearch();
  // Set by the invitation page, in the history state rather than the URL: no address in logs.
  const { invitedEmail, passwordChanged } = useRouterState({
    select: (state) => state.location.state,
  });
  const passwordReset = useQuery(SessionQueries.passwordReset);
  return (
    <AuthLayout title={t('login.title')}>
      {invitedEmail || passwordChanged ? (
        <Alert tone="info" className="mb-5">
          {invitedEmail ? t('login.accountReady') : t('login.passwordChanged')}
        </Alert>
      ) : null}
      <LoginForm
        {...(invitedEmail ? { defaultEmail: invitedEmail } : {})}
        onSignedIn={() => router.navigate({ to: target ?? '/issues' })}
      />
      {passwordReset.data ? (
        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            {t('login.forgotPassword')}
          </Link>
        </p>
      ) : null}
    </AuthLayout>
  );
}
