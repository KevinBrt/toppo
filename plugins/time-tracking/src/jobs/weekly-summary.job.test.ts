import { createTestToppo, type TestHttpReply } from '@toppo-tracker/plugin-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logTime } from '../actions/log-time.action.ts';
import { plugin } from '../plugin.ts';
import { weeklySummary } from './weekly-summary.job.ts';

const WEB = '00000000-0000-4000-8000-000000000100';
const OPS = '00000000-0000-4000-8000-000000000200';
const DOCS = '00000000-0000-4000-8000-000000000300';
const CHAT = 'https://chat.example.com/hooks/T0';

/**
 * Time in three projects, on Monday 2 November 2026: WEB with a budget of 2 days of 7 hours and a
 * day of time from the week before, OPS over its budget of 1 day, DOCS without a budget, and time
 * from the week itself in each.
 */
async function logged(
  settings: Record<string, unknown> = {},
  chat: () => TestHttpReply = () => ({ status: 200 }),
) {
  const toppo = createTestToppo(plugin, {
    settings: { hoursPerDay: 7, summaryUrl: CHAT, ...settings },
    projectSettings: { [WEB]: { budgetDays: 2 }, [OPS]: { budgetDays: 1 }, [DOCS]: {} },
    http: chat,
  });
  const web = toppo.createIssue();
  const ops = toppo.createIssue({ projectId: OPS, projectKey: 'OPS' });
  const docs = toppo.createIssue({ projectId: DOCS, projectKey: 'DOCS' });
  const ada = toppo.createUser({ permissions: ['entries.log'] });
  for (const [issueId, minutes, spentOn] of [
    [web.id, 420, '2026-10-20'],
    [web.id, 90, '2026-10-26'],
    [ops.id, 480, '2026-10-30'],
    [docs.id, 45, '2026-11-01'],
    [docs.id, 30, '2026-11-02'],
  ] as const) {
    await ada.run(logTime, { issueId, minutes, spentOn });
  }
  return toppo;
}

const sent = (toppo: { requests: readonly { body: string | null }[] }) =>
  toppo.requests.map(({ body }) => (JSON.parse(body ?? '{}') as { text: string }).text);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the weekly summary', () => {
  it('tells the chat the time of the seven days before, by project, against each budget', async () => {
    const toppo = await logged();

    await toppo.runJob(weeklySummary);

    expect(toppo.requests).toMatchObject([
      { url: CHAT, method: 'POST', headers: { 'content-type': 'application/json' } },
    ]);
    expect(sent(toppo)).toStrictEqual([
      [
        'Time logged from 2026-10-26 to 2026-11-01:',
        '• DOCS: 0.8 h this week, 0.2 d in all',
        '• OPS: 8 h this week, 1.1 d of 1 d, over budget',
        '• WEB: 1.5 h this week, 1.2 d of 2 d',
      ].join('\n'),
    ]);
  });

  it('speaks the language its settings say', async () => {
    const toppo = await logged({ summaryLanguage: 'fr' });

    await toppo.runJob(weeklySummary);

    expect(sent(toppo)[0]?.split('\n')).toStrictEqual([
      'Temps saisi du 2026-10-26 au 2026-11-01 :',
      '• DOCS : 0,8 h cette semaine, 0,2 j en tout',
      '• OPS : 8 h cette semaine, 1,1 j sur 1 j, budget dépassé',
      '• WEB : 1,5 h cette semaine, 1,2 j sur 2 j',
    ]);
  });

  it('tells nothing without an address, nor of a week without time', async () => {
    const unset = await logged({ summaryUrl: undefined });
    await unset.runJob(weeklySummary);
    vi.setSystemTime(new Date('2026-12-01T08:00:00Z'));
    const quiet = await logged();
    await quiet.runJob(weeklySummary);

    expect([unset.requests, quiet.requests]).toStrictEqual([[], []]);
  });

  it('fails when the chat refuses it, to be tried again', async () => {
    const toppo = await logged({}, () => ({ status: 404 }));

    await expect(toppo.runJob(weeklySummary)).rejects.toMatchObject({
      code: 'PLUGIN_ERROR',
      detail: expect.stringContaining('The chat answered 404'),
    });
  });
});
