import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { listEntries } from './list-entries.action.ts';
import { logTime } from './log-time.action.ts';

describe('timeEntry.list', () => {
  it('shows an issue’s entries, the latest first, who wrote each, and their total', async () => {
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();
    const other = toppo.createIssue();
    const ada = toppo.createUser({ permissions: ['entries.log'] });
    await ada.run(logTime, { issueId: issue.id, minutes: 30, spentOn: '2026-10-27' });
    await ada.run(logTime, {
      issueId: issue.id,
      minutes: 45,
      spentOn: '2026-10-28',
      note: 'Review',
    });
    await ada.run(logTime, { issueId: other.id, minutes: 60, spentOn: '2026-10-28' });

    expect(await ada.run(listEntries, { issueId: issue.id })).toStrictEqual({
      entries: [
        {
          id: expect.any(String),
          minutes: 45,
          spentOn: '2026-10-28',
          note: 'Review',
          createdBy: ada.id,
        },
        {
          id: expect.any(String),
          minutes: 30,
          spentOn: '2026-10-27',
          note: null,
          createdBy: ada.id,
        },
      ],
      count: 2,
      total: 75,
    });
  });

  it('shows nothing of an issue its reader does not see', async () => {
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();

    await expect(
      toppo.createUser({ sees: [] }).run(listEntries, { issueId: issue.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
