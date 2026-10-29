import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WebhookSummary } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { SendIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Webhooks } from '../../api/webhooks.api.ts';
import { WEBHOOK_ERRORS } from '../../constants/webhook-messages.constants.ts';
import { WebhooksQueries } from '../../queries/webhooks.queries.ts';
import { webhookState } from '../../utils/webhook-state.util.ts';
import { WebhookSection } from '../webhook-section.tsx';
import { DeleteWebhookDialog } from './delete-webhook-dialog.tsx';

type Change = 'test' | 'enable' | 'disable';

const CHANGES: Readonly<Record<Change, (id: string) => Promise<void>>> = {
  test: (id) => Webhooks.sendTest(id),
  enable: (id) => Webhooks.enable(id),
  disable: (id) => Webhooks.disable(id),
};

/**
 * What an administrator does with a webhook: send it a test, disable it or enable it again,
 * delete it. Reports it deleted.
 */
export function WebhookManagement({
  webhook,
  onDeleted,
}: {
  webhook: WebhookSummary;
  onDeleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const state = webhookState(webhook);

  return (
    <WebhookSection title={t('webhooks.manageTitle')}>
      <div className="-mx-5 -mb-5 divide-y divide-border border-t border-border sm:-mx-6 sm:-mb-6">
        {webhook.enabled ? (
          <ManageRow title={t('webhooks.testTitle')} description={t('webhooks.testHelp')}>
            <ChangeButton
              webhook={webhook}
              change="test"
              label={t('webhooks.sendTest')}
              done={t('webhooks.testSent')}
            />
          </ManageRow>
        ) : null}
        {webhook.enabled ? (
          <ManageRow title={t('webhooks.disableTitle')} description={t('webhooks.disableHelp')}>
            <ChangeButton webhook={webhook} change="disable" label={t('webhooks.disable')} />
          </ManageRow>
        ) : null}
        {/* Stopped for failing: the alert above enables it again. */}
        {state === 'disabled' ? (
          <ManageRow title={t('webhooks.enableTitle')} description={t('webhooks.enableHelp')}>
            <ChangeButton webhook={webhook} change="enable" label={t('webhooks.enable')} />
          </ManageRow>
        ) : null}
        <ManageRow title={t('webhooks.deleteTitle')} description={t('webhooks.deleteHelp')}>
          <DeleteWebhookDialog webhook={webhook} onDeleted={onDeleted} />
        </ManageRow>
      </div>
    </WebhookSection>
  );
}

function ManageRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-end sm:self-auto">{children}</div>
    </div>
  );
}

/** Sends a test, enables or disables a webhook at once: none loses anything. */
function ChangeButton({
  webhook,
  change,
  label,
  done,
}: {
  webhook: WebhookSummary;
  change: Change;
  label: string;
  /** Said once done, when the page shows nothing else of it. */
  done?: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => CHANGES[change](webhook.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WebhooksQueries.all });
    },
  });

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {change === 'test' ? <SendIcon aria-hidden="true" /> : null}
        {label}
      </Button>
      {mutation.isSuccess && done ? (
        <p role="status" className="text-sm text-muted-foreground sm:max-w-sm sm:text-right">
          {done}
        </p>
      ) : null}
      {mutation.isError ? (
        <Alert tone="danger" className="sm:max-w-sm">
          {requestErrorMessage(mutation.error, t, WEBHOOK_ERRORS)}
        </Alert>
      ) : null}
    </div>
  );
}
