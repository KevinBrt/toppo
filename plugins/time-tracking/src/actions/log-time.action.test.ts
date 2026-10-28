import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { logTime, MINUTES_PER_DAY } from './log-time.action.ts';

/** A Toppo with one issue, and someone who may log time on it. */
function withIssue() {
  const toppo = createTestToppo(plugin);
  const issue = toppo.createIssue();
  const logger = toppo.createUser({ permissions: ['entries.log'] });
  return { toppo, issue, logger };
}

describe('timeEntry.log', () => {
  it('logs the minutes spent on an issue, for whoever asked', async () => {
    const { issue, logger } = withIssue();

    expect(await logger.run(logTime, { issueId: issue.id, minutes: 90 })).toStrictEqual({
      issueId: issue.id,
      minutes: 90,
      userId: logger.id,
    });
  });

  it('takes up to a whole day at once', async () => {
    const { issue, logger } = withIssue();

    expect(
      await logger.run(logTime, { issueId: issue.id, minutes: MINUTES_PER_DAY }),
    ).toMatchObject({ minutes: MINUTES_PER_DAY });
  });

  it('refuses someone without the permission to log time', async () => {
    const { toppo, issue } = withIssue();
    const reader = toppo.createUser();

    await expect(reader.run(logTime, { issueId: issue.id, minutes: 30 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses an issue its logger does not see, as if it did not exist', async () => {
    const { toppo, issue } = withIssue();
    const outsider = toppo.createUser({ sees: [], permissions: ['entries.log'] });

    await expect(outsider.run(logTime, { issueId: issue.id, minutes: 30 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it.each([
    ['no time', 0],
    ['more than a day', MINUTES_PER_DAY + 1],
    ['part of a minute', 1.5],
  ])('refuses %s', async (_, minutes) => {
    const { issue, logger } = withIssue();

    await expect(logger.run(logTime, { issueId: issue.id, minutes })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
