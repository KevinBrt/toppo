import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENTITY_FIELDS_MAX, ENTITY_LIMITS, recordFieldsSchemaOf } from './entities.ts';
import { type Manifest, manifestSchema } from './manifest.ts';

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
