import { Badge, type BadgeTone } from '@toppo-tracker/ui';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import type { ShownPluginState } from '../models/plugin-page.model.ts';

const TONES: Readonly<Record<ShownPluginState, BadgeTone>> = {
  pending: 'amber',
  enabled: 'green',
  disabled: 'gray',
  stopped: 'orange',
};

/** Whether a plugin runs, waits for an approval, or was disabled, by someone or for failing. */
export function PluginStateBadge({ state }: { state: ShownPluginState }) {
  const { t } = useI18n();
  return <Badge tone={TONES[state]}>{t(`plugins.state.${state}`)}</Badge>;
}
