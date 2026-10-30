import { createRoute, useNavigate } from '@tanstack/react-router';
import { ProjectPicker } from '../../../../features/projects/components/picker/project-picker.tsx';
import { NewWebhook } from '../../../../features/webhooks/components/form/new-webhook.tsx';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../../shared/layout/access-denied.tsx';
import { Page } from '../../../../shared/layout/page.tsx';
import { useManagesWebhooks, webhooksRoute } from './webhooks.route.tsx';

/** A new webhook, whose page opens once its secret is copied. */
export const newWebhookRoute = createRoute({
  getParentRoute: () => webhooksRoute,
  path: 'new',
  staticData: { titleKey: 'webhooks.add' },
  component: NewWebhookScreen,
});

function NewWebhookScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const allowed = useManagesWebhooks();

  if (!allowed) {
    return (
      <Page title={t('webhooks.add')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page title={t('webhooks.add')} description={t('webhooks.addDescription')}>
      <NewWebhook
        projectPicker={(picker) => <ProjectPicker {...picker} />}
        onCreated={(id) =>
          navigate({ to: '/settings/webhooks/$webhookId', params: { webhookId: id } })
        }
      />
    </Page>
  );
}
