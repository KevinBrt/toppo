import { createRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { NotificationsList } from '../../../features/notifications/components/notifications-list.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { protectedRoute } from '../protected.route.tsx';

/** The page lives in the URL: kept by back and forward. */
const notificationsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

/** Every notification of the signed-in person, the latest first. */
export const notificationsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/notifications',
  validateSearch: notificationsSearchSchema,
  staticData: { titleKey: 'notifications.title' },
  component: NotificationsScreen,
});

function NotificationsScreen() {
  const { t } = useI18n();
  const navigate = useNavigate({ from: notificationsRoute.fullPath });
  const { page } = notificationsRoute.useSearch();

  return (
    <Page title={t('notifications.title')} description={t('notifications.description')}>
      <NotificationsList
        page={page ?? 1}
        onPage={(next) => navigate({ search: { page: next > 1 ? next : undefined } })}
      />
    </Page>
  );
}
