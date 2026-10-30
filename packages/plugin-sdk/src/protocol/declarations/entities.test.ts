import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type Manifest, manifestSchema } from '../manifest.ts';
import { ENTITY_FIELDS_MAX, ENTITY_LIMITS, indexKindOf, recordFieldsSchemaOf } from './entities.ts';

const TIME_ENTRY = z.object({
  minutes: z
    .int()
    .min(1)
    .max(24 * 60),
  spentOn: z.iso.date(),
  note: z.string().trim().max(500).optional(),
  kind: z.enum(['work', 'meeting']).default('work'),
  billable: z.boolean().default(true),
  rate: z.number().positive().optional(),
  // Toppo checks the format; the plugin's own pattern stays the plugin's.
  ticket: z
    .string()
    .max(20)
    .regex(/^[A-Z]+-\d+$/)
    .optional(),
});

const fieldsOf = (shape: z.ZodObject) =>
  z.toJSONSchema(shape, { io: 'input', unrepresentable: 'any' });

const manifest: Manifest = manifestSchema.parse({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  permissions: {},
  settings: { type: 'object', properties: {} },
  messages: { en: {}, fr: {} },
  actions: [],
  events: [],
});

const withEntity = (entity: Record<string, unknown>, more: Partial<Manifest> = {}) => ({
  ...manifest,
  entities: {
    timeEntry: { attachedTo: 'issue', fields: fieldsOf(TIME_ENTRY), limits: {}, ...entity },
  },
  ...more,
});

describe('the entities Toppo keeps', () => {
  it('takes fields as Zod writes them, and a manifest from before entities as having none', () => {
    expect(manifestSchema.parse(withEntity({})).entities['timeEntry']?.attachedTo).toBe('issue');
    expect(manifest.entities).toStrictEqual({});
  });

  it.each([
    ['a text of any length', z.object({ note: z.string() })],
    ['a field that may be null', z.object({ note: z.string().max(10).nullable() })],
    ['a list', z.object({ tags: z.array(z.string().max(10)) })],
    ['an object', z.object({ period: z.object({ from: z.iso.date() }) })],
    ['a field named as Toppo names its own', z.object({ createdAt: z.iso.date() })],
    [
      'more fields than an entity takes',
      z.object(
        Object.fromEntries(
          Array.from({ length: ENTITY_FIELDS_MAX + 1 }, (_, i) => [`field${i}`, z.boolean()]),
        ),
      ),
    ],
  ])('refuses %s', (_, shape) => {
    expect(manifestSchema.safeParse(withEntity({ fields: fieldsOf(shape) })).success).toBe(false);
  });

  it('refuses records on issues from a plugin that does not read them, saying which', () => {
    const declared = manifestSchema.safeParse(withEntity({}, { needs: [] }));

    expect(declared.error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['entities', 'timeEntry', 'attachedTo'],
        message: 'timeEntry hangs on issues: the plugin needs issue.read',
      }),
    ]);
  });

  it('refuses limits of the other kind, or past the most Toppo keeps', () => {
    const otherKind = manifestSchema.safeParse(withEntity({ limits: { perProject: 10 } }));
    const tooMany = manifestSchema.safeParse(
      withEntity({ limits: { perIssue: ENTITY_LIMITS.perIssue.max + 1 } }),
    );
    const ofProjects = manifestSchema.safeParse(
      withEntity({ attachedTo: 'project', limits: { perProject: ENTITY_LIMITS.perProject.max } }),
    );

    expect(otherKind.error?.issues[0]?.message).toBe(
      'timeEntry hangs on issues: it has no perProject limit',
    );
    expect(tooMany.success).toBe(false);
    expect(ofProjects.success).toBe(true);
  });

  it('keeps records on a person for a plugin asking for the API that brought them', () => {
    const onPerson = { attachedTo: 'person', visibleTo: 'teammates', limits: { perPerson: 5000 } };

    const declared = manifestSchema.safeParse(withEntity(onPerson, { apiVersion: '^1.1' }));
    const tooOld = manifestSchema.safeParse(withEntity(onPerson));

    expect(declared.data?.entities['timeEntry']).toMatchObject(onPerson);
    expect(tooOld.error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['entities', 'timeEntry', 'attachedTo'],
        message: 'timeEntry hangs on a person: the plugin asks for API ^1.1',
      }),
    ]);
  });

  it('says who sees records on a person only, bounded by person', () => {
    const shownAsIssues = manifestSchema.safeParse(withEntity({ visibleTo: 'person' }));
    const boundedByIssue = manifestSchema.safeParse(
      withEntity({ attachedTo: 'person', limits: { perIssue: 10 } }, { apiVersion: '^1.1' }),
    );
    const tooMany = manifestSchema.safeParse(
      withEntity(
        { attachedTo: 'person', limits: { perPerson: ENTITY_LIMITS.perPerson.max + 1 } },
        { apiVersion: '^1.1' },
      ),
    );

    expect(shownAsIssues.error?.issues[0]?.message).toBe(
      'timeEntry hangs on issues: they are seen as those are',
    );
    expect(boundedByIssue.error?.issues[0]?.message).toBe(
      'timeEntry hangs on persons: it has no perIssue limit',
    );
    expect(tooMany.success).toBe(false);
  });
});

describe('the indexes of an entity', () => {
  const INDEXED = z.object({
    spentOn: z.iso.date(),
    startedAt: z.iso.datetime(),
    minutes: z.int(),
    kind: z.enum(['work', 'meeting']).default('work'),
    ticket: z.string().max(20).default(''),
    reviewer: z.uuid(),
    mail: z.email(),
    billable: z.boolean(),
    note: z.string().max(500),
    rate: z.number().optional(),
    day1: z.iso.date(),
    day2: z.iso.date(),
  });
  const indexing = (indexes: string[]) =>
    manifestSchema.safeParse(withEntity({ fields: fieldsOf(INDEXED), indexes }));

  it('take a field of each kind Toppo keeps, and none from a manifest from before them', () => {
    const indexes = ['spentOn', 'startedAt', 'minutes', 'kind', 'ticket', 'reviewer', 'mail'];

    expect(indexing(indexes).data?.entities['timeEntry']?.indexes).toStrictEqual(indexes);
    expect(manifestSchema.parse(withEntity({})).entities['timeEntry']?.indexes).toStrictEqual([]);
  });

  it.each([
    [['hours'], 'There is no field hours to index'],
    [['minutes', 'minutes'], 'minutes is indexed twice'],
    [
      ['billable'],
      'billable is not indexed: only a number, a date, an id, a choice or a text of 200 characters at most is',
    ],
    [
      ['note'],
      'note is not indexed: only a number, a date, an id, a choice or a text of 200 characters at most is',
    ],
    [['rate'], 'rate is indexed: make it required, or give it a default'],
    [['spentOn', 'startedAt', 'day1', 'day2'], 'timeEntry indexes 3 dates at most'],
  ])('refuse %j, saying why', (indexes, message) => {
    expect(indexing(indexes).error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['entities', 'timeEntry', 'indexes', indexes.length - 1],
        message,
      }),
    ]);
  });

  it('take a slot of the kind of their field', () => {
    const fields = manifestSchema.parse(withEntity({ fields: fieldsOf(INDEXED) })).entities[
      'timeEntry'
    ]?.fields.properties;

    expect(
      Object.fromEntries(
        Object.entries(fields ?? {}).map(([name, field]) => [name, indexKindOf(field)]),
      ),
    ).toStrictEqual({
      spentOn: 'date',
      startedAt: 'date',
      minutes: 'number',
      kind: 'text',
      ticket: 'text',
      reviewer: 'ref',
      mail: 'text',
      billable: undefined,
      note: undefined,
      rate: 'number',
      day1: 'date',
      day2: 'date',
    });
  });
});

describe('Toppo’s own check of a record', () => {
  const check = recordFieldsSchemaOf(
    manifestSchema.parse(withEntity({})).entities['timeEntry']?.fields ?? {
      type: 'object',
      properties: {},
    },
  );

  it('takes what the entity declares, its defaults applied', () => {
    expect(check.parse({ minutes: 90, spentOn: '2026-10-28', ticket: 'not one' })).toStrictEqual({
      minutes: 90,
      spentOn: '2026-10-28',
      kind: 'work',
      billable: true,
      ticket: 'not one',
    });
  });

  it.each([
    ['a field it does not declare', { minutes: 90, spentOn: '2026-10-28', hours: 1 }],
    ['a field it requires, left out', { spentOn: '2026-10-28' }],
    ['a number out of its bounds', { minutes: 0, spentOn: '2026-10-28' }],
    ['part of a whole number', { minutes: 1.5, spentOn: '2026-10-28' }],
    ['a date that is none', { minutes: 90, spentOn: '2026-02-30' }],
    ['a choice it does not offer', { minutes: 90, spentOn: '2026-10-28', kind: 'sleep' }],
    ['a text too long', { minutes: 90, spentOn: '2026-10-28', note: 'x'.repeat(501) }],
    ['a number not above its minimum', { minutes: 90, spentOn: '2026-10-28', rate: 0 }],
  ])('refuses %s', (_, record) => {
    expect(check.safeParse(record).success).toBe(false);
  });

  it('checks the formats it knows, with its own patterns', () => {
    const formats = recordFieldsSchemaOf(
      manifestSchema.parse(
        withEntity({
          fields: fieldsOf(
            z.object({
              at: z.iso.datetime(),
              who: z.uuid(),
              mail: z.email(),
              every: z.int().multipleOf(15),
            }),
          ),
        }),
      ).entities['timeEntry']?.fields ?? { type: 'object', properties: {} },
    );
    const record = {
      at: '2026-10-28T09:00:00.000Z',
      who: '01a1569b-9900-7000-8000-000000000001',
      mail: 'ada@example.com',
      every: 30,
    };

    expect(formats.parse(record)).toStrictEqual(record);
    expect(formats.safeParse({ ...record, at: 'yesterday' }).success).toBe(false);
    expect(formats.safeParse({ ...record, who: 'ada' }).success).toBe(false);
    expect(formats.safeParse({ ...record, mail: 'ada' }).success).toBe(false);
    expect(formats.safeParse({ ...record, every: 20 }).success).toBe(false);
  });
});
