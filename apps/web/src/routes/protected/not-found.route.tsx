import { createRoute, Link } from '@tanstack/react-router';
import { buttonVariants, EmptyState } from '@toppo-tracker/ui';
import { CompassIcon } from 'lucide-react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../shared/layout/page.tsx';
import { protectedRoute } from './protected.route.tsx';

/** Unknown addresses stay behind sign-in and inside the frame, like every other page. */
export const notFoundRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '$',
  component: NotFoundScreen,
});

function NotFoundScreen() {
  const { t } = useI18n();
  return (
    <Page title={t('notFound.title')}>
      <EmptyState
        icon={CompassIcon}
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={
          <Link to="/issues" className={buttonVariants({ variant: 'secondary' })}>
            {t('notFound.backToIssues')}
          </Link>
        }
      />
    </Page>
  );
}
