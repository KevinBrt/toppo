import type { PluginState } from '@toppo-tracker/shared';
import type { ReactNode } from 'react';

/** A plugin's state as its page shows it: `stopped` when Toppo disabled it for failing. */
export type ShownPluginState = PluginState | 'stopped';

/** Where a plugin acts: in every project, present and future, or in those chosen. */
export type PluginReach = 'all' | 'chosen';

/** A project a plugin acts in, as the picker shows it. */
export interface PickedProject {
  key: string;
  name: string;
}

/**
 * Draws the picker of the projects a plugin acts in. Projects are another feature: the screen
 * passes the picker in.
 */
export type ProjectPickerSlot = (props: {
  label: string;
  chosen: readonly PickedProject[];
  onChange: (chosen: PickedProject[]) => void;
}) => ReactNode;

/**
 * Names a core permission a plugin needs (`issue.read`) in the user's language, as the roles
 * screen names it. Roles are another feature: the screen passes the names in.
 */
export type NeedLabel = (need: string) => string;
