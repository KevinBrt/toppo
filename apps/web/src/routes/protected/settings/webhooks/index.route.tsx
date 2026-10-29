import { createRoute, Link } from '@tanstack/react-router';
import { buttonVariants } from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { WebhooksList } from '../../../../features/webhooks/components/list/webhooks-list.tsx';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../../shared/layout/access-denied.tsx';
import { Page } from '../../../../shared/layout/page.tsx';
import { useManagesWebhooks, webhooksRoute } from './webhooks.route.tsx';

/** The webhooks of the instance, and adding another one. */
export const webhooksIndexRoute = createRoute({
  getParentRoute: () => webhooksRoute,
  path: '/',
  component: WebhooksScreen,
});

function WebhooksScreen() {
  const { t } = useI18n();
  const allowed = useManagesWebhooks();

  if (!allowed) {
    return (
      <Page title={t('webhooks.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page
      title={t('webhooks.title')}
      description={t('webhooks.description')}
      actions={
        <Link to="/settings/webhooks/new" className={buttonVariants()}>
          <PlusIcon aria-hidden="true" />
          {t('webhooks.add')}
        </Link>
      }
    >
      <WebhooksList />
    </Page>
  );
}
