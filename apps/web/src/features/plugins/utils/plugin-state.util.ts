import { FAILURES_BEFORE_DISABLING, type PluginDetailsResponse } from '@toppo-tracker/shared';

import type { ShownPluginState } from '../models/plugin-page.model.ts';

type FailingState = Pick<PluginDetailsResponse, 'state' | 'failures' | 'lastFailure'>;

/** Whether Toppo disabled the plugin for failing again and again, rather than someone. */
export function isStopped({ state, failures, lastFailure }: FailingState): boolean {
  return state === 'disabled' && failures >= FAILURES_BEFORE_DISABLING && lastFailure !== null;
}

export function shownStateOf(plugin: FailingState): ShownPluginState {
  return isStopped(plugin) ? 'stopped' : plugin.state;
}
