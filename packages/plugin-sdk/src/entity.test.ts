import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createEntityClient, defineEntity, type EntityCaller } from './entity.ts';
import type { RecordData } from './protocol/calls.ts';

const ISSUE = '01a1569b-9900-7000-8000-000000000042';
const PROJECT = '01a1569b-9900-7000-8000-000000000100';
const ADA = '01a1569b-9900-7000-8000-000000000001';

const timeEntry = defineEntity({
  attachedTo: 'issue',
  fields: z.object({
    minutes: z.int().min(1),
    spentOn: z.iso.date(),
    note: z.string().trim().max(500).optional(),
  }),
  indexes: ['spentOn'],
  limits: { perIssue: 500 },
});

const record = (fields: Record<string, unknown>): RecordData => ({
  id: '01a1569b-9900-7000-8000-000000000900',
  issueId: ISSUE,
  projectId: PROJECT,
  createdBy: ADA,
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
  fields,
});

/** A Toppo that answers each call as given, and records them. */
function client(answers: Record<string, unknown>) {
  const call = vi.fn((method: string, _args: unknown) => Promise.resolve(answers[method]));
  return { call, entries: createEntityClient(call as EntityCaller, 'timeEntry', timeEntry) };
}

describe('an entity', () => {
  it('declares where its records hang, their fields, their indexes and their bounds', () => {
    expect(timeEntry).toMatchObject({
      attachedTo: 'issue',
      indexes: ['spentOn'],
      limits: { perIssue: 500 },
    });
    expect(defineEntity({ attachedTo: 'project', fields: z.object({}) })).toMatchObject({
      indexes: [],
      limits: {},
    });
  });
});

describe('the records of an entity', () => {
  it('are written as the plugin’s schema leaves them, and read with their anchors', async () => {
    const saved = record({ minutes: 90, spentOn: '2026-10-28', note: 'Review' });
    const { call, entries } = client({ 'entities.create': saved, 'entities.update': saved });

    const created = await entries.create({
      issueId: ISSUE,
      minutes: 90,
      spentOn: '2026-10-28',
      note: '  Review ',
    });
    await entries.update(saved.id, { note: ' Review ' });

    expect(created).toStrictEqual({
      id: saved.id,
      issueId: ISSUE,
      projectId: PROJECT,
      createdBy: ADA,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      minutes: 90,
      spentOn: '2026-10-28',
      note: 'Review',
    });
    expect(call.mock.calls).toStrictEqual([
      [
        'entities.create',
        {
          entity: 'timeEntry',
          issueId: ISSUE,
          fields: { minutes: 90, spentOn: '2026-10-28', note: 'Review' },
        },
      ],
      ['entities.update', { entity: 'timeEntry', id: saved.id, fields: { note: 'Review' } }],
    ]);
  });

  it('are refused before Toppo sees them when the plugin’s schema refuses them', async () => {
    const { call, entries } = client({});

    await expect(
      entries.create({ issueId: ISSUE, minutes: 0, spentOn: 'today' }),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('are found, listed, deleted, counted and summed, by group or not', async () => {
    const one = record({ minutes: 30, spentOn: '2026-10-28' });
    const groups = [{ key: ADA, value: 90 }];
    const { call, entries } = client({
      'entities.get': one,
      'entities.list': { items: [one], total: 1 },
      'entities.delete': null,
      'entities.aggregate': { total: 90, groups },
    });

    expect(await entries.get(one.id)).toMatchObject({ minutes: 30 });
    expect(await entries.list({ where: { issueId: ISSUE }, direction: 'asc' })).toMatchObject({
      items: [{ minutes: 30 }],
      total: 1,
    });
    await entries.delete(one.id);
    expect(await entries.count()).toBe(90);
    expect(await entries.countBy('createdBy')).toStrictEqual(groups);
    expect(await entries.sum('minutes', { where: { projectId: PROJECT } })).toBe(90);
    expect(await entries.sumBy('minutes', 'issueId')).toStrictEqual(groups);
    expect(call.mock.calls.map(([, args]) => args)).toStrictEqual([
      { entity: 'timeEntry', id: one.id },
      { entity: 'timeEntry', where: { issueId: ISSUE }, direction: 'asc' },
      { entity: 'timeEntry', id: one.id },
      { entity: 'timeEntry', op: 'count', where: {} },
      { entity: 'timeEntry', op: 'count', groupBy: 'createdBy', where: {} },
      { entity: 'timeEntry', op: 'sum', field: 'minutes', where: { projectId: PROJECT } },
      { entity: 'timeEntry', op: 'sum', field: 'minutes', groupBy: 'issueId', where: {} },
    ]);
  });

  it('are filtered, sorted and grouped on the fields the entity indexes', async () => {
    const days = [{ key: '2026-10-28', value: 90 }];
    const { call, entries } = client({
      'entities.list': { items: [], total: 0 },
      'entities.aggregate': { total: 90, groups: days },
    });
    const october = { gte: '2026-10-01', lt: '2026-11-01' };

    await entries.list({
      where: { createdBy: ADA, spentOn: october },
      orderBy: 'spentOn',
      direction: 'asc',
    });
    const byDay = await entries.sumBy('minutes', 'spentOn', {
      where: { spentOn: { in: ['2026-10-28'] } },
    });

    expect(byDay).toStrictEqual(days);
    expect(call.mock.calls.map(([, args]) => args)).toStrictEqual([
      {
        entity: 'timeEntry',
        where: { createdBy: ADA, fields: { spentOn: october } },
        orderBy: 'spentOn',
        direction: 'asc',
      },
      {
        entity: 'timeEntry',
        op: 'sum',
        field: 'minutes',
        groupBy: 'spentOn',
        where: { fields: { spentOn: { in: ['2026-10-28'] } } },
      },
    ]);
  });

  it('answers nothing for a record not there, and no group when Toppo gives none', async () => {
    const { entries } = client({ 'entities.get': null, 'entities.aggregate': { total: 0 } });

    expect(await entries.get('01a1569b-9900-7000-8000-000000000999')).toBeNull();
    expect(await entries.countBy('projectId')).toStrictEqual([]);
    expect(await entries.sumBy('minutes', 'projectId')).toStrictEqual([]);
  });

  it('says so when a record no longer fits the plugin’s schema', async () => {
    const old = record({ minutes: 'many', spentOn: '2026-10-28' });
    const { entries } = client({ 'entities.get': old });

    await expect(entries.get(old.id)).rejects.toThrow(
      `The record ${old.id} of timeEntry does not fit this version`,
    );
  });
});
