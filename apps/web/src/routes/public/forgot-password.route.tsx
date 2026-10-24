import { createRoute, Link } from '@tanstack/react-router';
import { ForgotPasswordForm } from '../../features/session/components/forgot-password-form.tsx';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { AuthLayout } from '../../shared/layout/auth-layout.tsx';
import { rootRoute } from '../root.route.tsx';

/** Where someone who forgot their password asks for a link to choose a new one. */
export const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordScreen,
});

function ForgotPasswordScreen() {
  const { t } = useI18n();
  return (
    <AuthLayout title={t('passwordReset.requestTitle')}>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('passwordReset.backToLogin')}
        </Link>
      </p>
    </AuthLayout>
  );
}
