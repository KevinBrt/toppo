import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@toppo-tracker/ui';
import { WebhookIcon } from 'lucide-react';
import { ProjectPicker } from '../../../../features/projects/components/picker/project-picker.tsx';
import { WebhookDetails } from '../../../../features/webhooks/components/details/webhook-details.tsx';
import { WebhooksQueries } from '../../../../features/webhooks/queries/webhooks.queries.ts';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../../shared/layout/access-denied.tsx';
import { Page, useDocumentTitle } from '../../../../shared/layout/page.tsx';
import { CRUMB_CURRENT_CLASS, type CrumbProps } from '../../../../shared/layout/topbar.tsx';
import { useManagesWebhooks, webhooksRoute } from './webhooks.route.tsx';

/** The webhook's name in the top bar, once known. */
function WebhookCrumb({ params }: CrumbProps) {
  const { t } = useI18n();
  const webhookId = params['webhookId'] ?? '';
  const allowed = useManagesWebhooks();
  const { data: webhook } = useQuery({ ...WebhooksQueries.detail(webhookId), enabled: allowed });
  return (
    <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
      {webhook?.name ?? t('webhooks.webhook')}
    </span>
  );
}

/** A webhook's page, at its id. */
export const webhookRoute = createRoute({
  getParentRoute: () => webhooksRoute,
  path: '$webhookId',
  staticData: { crumb: WebhookCrumb },
  component: WebhookScreen,
});

function WebhookScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { webhookId } = webhookRoute.useParams();
  const allowed = useManagesWebhooks();
  const webhook = useQuery({ ...WebhooksQueries.detail(webhookId), enabled: allowed });
  useDocumentTitle(webhook.data?.name ?? t('webhooks.webhook'));

  if (!allowed) {
    return (
      <Page title={t('webhooks.title')}>
        <AccessDenied />
      </Page>
    );
  }
  if (webhook.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('webhooks.webhookLoading')}
      </p>
    );
  }
  if (webhook.isError) {
    // An id that is no UUID is refused before it is looked for: it is not found all the same.
    const missing =
      webhook.error instanceof ApiRequestError &&
      (webhook.error.status === 404 || webhook.error.status === 400);
    return (
      <Page title={missing ? t('notFound.title') : t('webhooks.webhook')}>
        <EmptyState
          icon={WebhookIcon}
          title={missing ? t('notFound.title') : t('errors.unexpected')}
          description={missing ? t('webhooks.notFound') : requestErrorMessage(webhook.error, t)}
        />
      </Page>
    );
  }
  return (
    <WebhookDetails
      webhook={webhook.data}
      projectPicker={(picker) => <ProjectPicker {...picker} />}
      onDeleted={() => navigate({ to: '/settings/webhooks', replace: true })}
    />
  );
}
