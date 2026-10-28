import type { PaletteColor } from '@toppo-tracker/shared';

/** The colors new projects get in turn: gray is left for those an administrator wants quiet. */
const PROJECT_COLOR_ROTATION = [
  'blue',
  'orange',
  'violet',
  'green',
  'pink',
  'amber',
  'cyan',
] as const satisfies readonly PaletteColor[];

/** The color of a new project, from how many projects the instance already has. */
export function projectColorFor(existingProjects: number): PaletteColor {
  const index = Math.max(0, Math.trunc(existingProjects)) % PROJECT_COLOR_ROTATION.length;
  return PROJECT_COLOR_ROTATION[index] ?? 'blue';
}
