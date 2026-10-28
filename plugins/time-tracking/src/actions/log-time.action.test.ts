import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../entities/time-entry.entity.ts';
import { plugin } from '../plugin.ts';
import { logTime } from './log-time.action.ts';

const DAY = '2026-10-28';

/** A Toppo with one issue, and someone who may log time on it. */
function withIssue() {
  const toppo = createTestToppo(plugin);
  const issue = toppo.createIssue();
  const logger = toppo.createUser({ permissions: ['entries.log'] });
  return { toppo, issue, logger };
}

describe('timeEntry.log', () => {
  it('keeps the time spent on an issue on a day, written by whoever logged it', async () => {
    const { toppo, issue, logger } = withIssue();

    const entry = await logger.run(logTime, {
      issueId: issue.id,
      minutes: 90,
      spentOn: DAY,
      note: '  Review ',
    });

    expect(entry).toMatchObject({
      issueId: issue.id,
      projectId: issue.projectId,
      createdBy: logger.id,
      minutes: 90,
      spentOn: DAY,
      note: 'Review',
    });
    expect(toppo.records('timeEntry')).toMatchObject([
      { id: entry.id, fields: { minutes: 90, spentOn: DAY, note: 'Review' } },
    ]);
  });

  it('takes up to a whole day at once', async () => {
    const { issue, logger } = withIssue();

    expect(
      await logger.run(logTime, { issueId: issue.id, minutes: MINUTES_PER_DAY, spentOn: DAY }),
    ).toMatchObject({ minutes: MINUTES_PER_DAY });
  });

  it('refuses someone without the permission to log time', async () => {
    const { toppo, issue } = withIssue();
    const reader = toppo.createUser();

    await expect(
      reader.run(logTime, { issueId: issue.id, minutes: 30, spentOn: DAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an issue its logger does not see, as if it did not exist', async () => {
    const { toppo, issue } = withIssue();
    const outsider = toppo.createUser({ sees: [], permissions: ['entries.log'] });

    await expect(
      outsider.run(logTime, { issueId: issue.id, minutes: 30, spentOn: DAY }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    ['no time', { minutes: 0, spentOn: DAY }],
    ['more than a day', { minutes: MINUTES_PER_DAY + 1, spentOn: DAY }],
    ['part of a minute', { minutes: 1.5, spentOn: DAY }],
    ['a day that is none', { minutes: 30, spentOn: '2026-02-30' }],
    ['a note too long', { minutes: 30, spentOn: DAY, note: 'x'.repeat(501) }],
  ])('refuses %s', async (_, entry) => {
    const { toppo, issue, logger } = withIssue();

    await expect(logger.run(logTime, { issueId: issue.id, ...entry })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(toppo.records('timeEntry')).toStrictEqual([]);
  });

  it('stops at a thousand entries on one issue', async () => {
    const { issue, logger } = withIssue();
    for (let entry = 0; entry < 1000; entry++) {
      await logger.run(logTime, { issueId: issue.id, minutes: 1, spentOn: DAY });
    }

    await expect(
      logger.run(logTime, { issueId: issue.id, minutes: 1, spentOn: DAY }),
    ).rejects.toMatchObject({ code: 'PLUGIN_ERROR', detail: 'RECORD_LIMIT_REACHED' });
  });
});
