import { defineProperty } from '@toppo-tracker/plugin-sdk';

/**
 * The time logged on an issue, all entries together, in minutes shown as hours: written by the
 * plugin as time is logged, read by everyone, typed in by no one.
 */
export const timeSpent = defineProperty({
  name: 'properties.timeSpent',
  type: 'number',
  display: 'duration',
  writtenBy: 'plugin',
});
