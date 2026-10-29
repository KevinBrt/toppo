import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { logTime } from './log-time.action.ts';
import { projectReport } from './project-report.action.ts';

const WEB = '00000000-0000-4000-8000-000000000100';
const OPS = '00000000-0000-4000-8000-000000000200';

/** Time in two projects, WEB with a budget of one day of 7 hours, one of its issues closed. */
async function logged() {
  const toppo = createTestToppo(plugin, {
    settings: { hoursPerDay: 7 },
    projectSettings: { [WEB]: { budgetDays: 1 }, [OPS]: {} },
  });
  const open = toppo.createIssue();
  const closed = toppo.createIssue({ closedAt: '2026-10-28T17:00:00.000Z' });
  const elsewhere = toppo.createIssue({ projectId: OPS, projectKey: 'OPS' });
  const ada = toppo.createUser({ permissions: ['entries.log'] });
  await ada.run(logTime, { issueId: open.id, minutes: 300, spentOn: '2026-10-28' });
  await ada.run(logTime, { issueId: closed.id, minutes: 180, spentOn: '2026-10-28' });
  await ada.run(logTime, { issueId: elsewhere.id, minutes: 60, spentOn: '2026-10-28' });
  return { toppo, ada };
}

describe('report.projects', () => {
  it('counts each project’s time against its budget, closed issues apart from the others', async () => {
    const { ada } = await logged();

    expect(await ada.run(projectReport, {})).toStrictEqual({
      hoursPerDay: 7,
      choices: [
        { projectId: OPS, projectKey: 'OPS' },
        { projectId: WEB, projectKey: 'WEB' },
      ],
      projects: [
        {
          projectId: OPS,
          projectKey: 'OPS',
          spentMinutes: 60,
          closedMinutes: 0,
          openMinutes: 60,
          budgetDays: null,
          overBudget: false,
        },
        {
          projectId: WEB,
          projectKey: 'WEB',
          spentMinutes: 480,
          closedMinutes: 180,
          openMinutes: 300,
          budgetDays: 1,
          // 480 minutes, against a day of 7 hours.
          overBudget: true,
        },
      ],
    });
  });

  it('shows one project when asked, every project with time still a choice', async () => {
    const { ada } = await logged();

    const report = await ada.run(projectReport, { projectId: OPS });

    expect(report.projects.map(({ projectKey }) => projectKey)).toStrictEqual(['OPS']);
    expect(report.choices).toHaveLength(2);
  });

  it('shows only the time on issues its reader sees', async () => {
    const { toppo } = await logged();
    const outsider = toppo.createUser({ sees: [] });

    expect(await outsider.run(projectReport, {})).toStrictEqual({
      hoursPerDay: 7,
      choices: [],
      projects: [],
    });
  });
});
