import { Badge, type BadgeTone } from '@toppo-tracker/ui';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import type { WebhookState } from '../utils/webhook-state.util.ts';

const TONES: Readonly<Record<WebhookState, BadgeTone>> = {
  enabled: 'green',
  disabled: 'gray',
  stopped: 'orange',
};

/** Whether a webhook is sent events, or was disabled, by someone or for failing. */
export function WebhookStateBadge({ state }: { state: WebhookState }) {
  const { t } = useI18n();
  return <Badge tone={TONES[state]}>{t(`webhooks.state.${state}`)}</Badge>;
}
