import type { WebhookDetailsResponse } from '@toppo-tracker/shared';
import type { ProjectPickerSlot } from '../../models/webhook-form.model.ts';
import { webhookState } from '../../utils/webhook-state.util.ts';
import { WebhookDeliveries } from './webhook-deliveries.tsx';
import { WebhookFailingAlert } from './webhook-failing-alert.tsx';
import { WebhookHeader } from './webhook-header.tsx';
import { WebhookManagement } from './webhook-management.tsx';
import { WebhookSettings } from './webhook-settings.tsx';
import { WebhookSigning } from './webhook-signing.tsx';

/**
 * A webhook's page: where it is sent and what of, how its requests are signed, how its latest
 * deliveries went, and what to do with it. Reports it deleted; the screen decides where to go.
 */
export function WebhookDetails({
  webhook,
  projectPicker,
  onDeleted,
}: {
  webhook: WebhookDetailsResponse;
  projectPicker: ProjectPickerSlot;
  onDeleted: () => Promise<void> | void;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <WebhookHeader webhook={webhook} />
      {/* Disabled by someone, it says nothing of its failures: enabling it forgets them. */}
      {webhook.failures > 0 && webhookState(webhook) !== 'disabled' ? (
        <WebhookFailingAlert webhook={webhook} />
      ) : null}
      <WebhookSettings webhook={webhook} projectPicker={projectPicker} />
      <WebhookSigning webhook={webhook} />
      <WebhookDeliveries webhook={webhook} />
      <WebhookManagement webhook={webhook} onDeleted={onDeleted} />
    </div>
  );
}
