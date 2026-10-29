import { WEBHOOK_FAILURES_BEFORE_DISABLING, type WebhookSummary } from '@toppo-tracker/shared';
import type { Translate } from '../../../shared/i18n/i18n.types.ts';
import { DELIVERY_ERROR_MESSAGES } from '../constants/webhook-messages.constants.ts';

/** A webhook's state as its pages show it: `stopped` when Toppo disabled it for failing. */
export type WebhookState = 'enabled' | 'disabled' | 'stopped';

export function webhookState({
  enabled,
  failures,
}: Pick<WebhookSummary, 'enabled' | 'failures'>): WebhookState {
  if (enabled) {
    return 'enabled';
  }
  return failures >= WEBHOOK_FAILURES_BEFORE_DISABLING ? 'stopped' : 'disabled';
}

/**
 * Why a delivery went wrong, in words: what the receiver answered (`HTTP_500`, or its status) or
 * why it got no answer.
 */
export function deliveryProblem(
  { status, error }: { status: number | null; error: string | null },
  t: Translate,
): string {
  if (status !== null) {
    return t('webhooks.answered', { status });
  }
  const answered = /^HTTP_(\d{3})$/.exec(error ?? '');
  if (answered) {
    return t('webhooks.answered', { status: Number(answered[1]) });
  }
  const message = error === null ? undefined : DELIVERY_ERROR_MESSAGES.get(error);
  return message ? t(message) : (error ?? '');
}
