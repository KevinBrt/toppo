import { PRIORITY_LEVELS, type PriorityLevel } from '@toppo-tracker/shared';

/** A level read from the database, which keeps them between 1 and 4: this only narrows the type. */
export function priorityLevelOf(level: number): PriorityLevel {
  const known = PRIORITY_LEVELS.find((candidate) => candidate === level);
  if (known === undefined) {
    throw new Error(`Unknown priority level ${level}`);
  }
  return known;
}
