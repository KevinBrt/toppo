import type { PaletteColor } from '@toppo-tracker/shared';

/** The colors a project can take, in the order its settings offer them. */
export const PROJECT_COLORS = [
  'orange',
  'blue',
  'violet',
  'green',
  'pink',
  'amber',
  'cyan',
  'gray',
] as const satisfies readonly PaletteColor[];
