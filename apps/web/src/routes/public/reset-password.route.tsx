import { createRoute, Link, useLocation, useRouter } from '@tanstack/react-router';
import { ResetPasswordForm } from '../../features/session/components/reset-password-form.tsx';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { AuthLayout } from '../../shared/layout/auth-layout.tsx';
import { rootRoute } from '../root.route.tsx';

/**
 * Where the link to choose a new password leads: `/reset-password#<token>`. After `#`, the token
 * never reaches the server with the page request; it is sent in a request body only.
 */
export const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordScreen,
});

function ResetPasswordScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useLocation({ select: (location) => location.hash });

  return (
    <AuthLayout title={t('passwordReset.title')}>
      <ResetPasswordForm
        token={token}
        onReset={() => router.navigate({ to: '/login', state: { passwordChanged: true } })}
      />
      <p className="mt-6 flex flex-col items-center gap-2 text-sm">
        <Link to="/forgot-password" className="font-medium text-primary hover:underline">
          {t('passwordReset.askAgain')}
        </Link>
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('passwordReset.backToLogin')}
        </Link>
      </p>
    </AuthLayout>
  );
}
