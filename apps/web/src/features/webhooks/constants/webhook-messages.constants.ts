import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';

/** Why the server refused a change of a webhook, in words an administrator can act on. */
export const WEBHOOK_ERRORS = {
  WEBHOOK_NOT_FOUND: 'webhooks.errors.notFound',
  PROJECT_NOT_FOUND: 'webhooks.errors.projectNotFound',
  WEBHOOK_LIMIT_REACHED: 'webhooks.errors.limitReached',
  WEBHOOK_DISABLED: 'webhooks.errors.disabled',
  WEBHOOK_DELIVERY_NOT_FOUND: 'webhooks.errors.deliveryNotFound',
} as const;

/**
 * Why a delivery got no answer, as its webhook's page says it. Mirrors the server's
 * `webhook_deliveries_error_check`; one added later shows by its code until it is worded.
 */
export const DELIVERY_ERROR_MESSAGES: ReadonlyMap<string, PlainMessageKey> = new Map([
  ['ADDRESS_NOT_ALLOWED', 'webhooks.deliveryErrors.addressNotAllowed'],
  ['TIMEOUT', 'webhooks.deliveryErrors.timeout'],
  ['RESPONSE_TOO_LARGE', 'webhooks.deliveryErrors.responseTooLarge'],
  ['TOO_MANY_REDIRECTS', 'webhooks.deliveryErrors.redirected'],
  ['NETWORK_ERROR', 'webhooks.deliveryErrors.networkError'],
  ['WEBHOOK_DISABLED', 'webhooks.deliveryErrors.webhookDisabled'],
  ['SECRET_UNREADABLE', 'webhooks.deliveryErrors.secretUnreadable'],
]);
