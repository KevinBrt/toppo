import { describe, expect, it } from 'vitest';
import { manifestSchema } from '../manifest.ts';

const manifest = (jobs: unknown) => ({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  needs: [],
  permissions: {},
  settings: { type: 'object', properties: {} },
  messages: { en: {}, fr: {} },
  actions: [],
  events: [],
  jobs,
});

const job = (name: string, every = 'week') => ({ name, every, label: 'jobs.summary' });

describe('the jobs a plugin declares', () => {
  it('run every hour, day or week; none for a plugin uploaded before them', () => {
    const declared = [job('weeklySummary'), job('dailyCheck', 'day'), job('sync', 'hour')];
    const { jobs: _none, ...before } = manifest([]);

    expect(manifestSchema.parse(manifest(declared)).jobs).toStrictEqual(declared);
    expect(manifestSchema.parse(before).jobs).toStrictEqual([]);
  });

  it.each([
    ['two of one name', [job('summary'), job('summary', 'day')]],
    ['one that runs every minute', [job('summary', 'minute')]],
    ['one named otherwise than a word', [job('weekly-summary')]],
    ['more than five', Array.from({ length: 6 }, (_, i) => job(`job${i}`))],
  ])('refuses %s', (_, jobs) => {
    expect(manifestSchema.safeParse(manifest(jobs)).success).toBe(false);
  });
});
