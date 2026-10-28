import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PLUGIN_NEEDS } from './calls.ts';
import { EVENT_TYPES, eventPayloadSchema } from './events.ts';
import { type Manifest, manifestSchema, PLUGIN_LIMITS } from './manifest.ts';
import { logoTypeOf } from './package.ts';
import { PLUGIN_SETTINGS_MAX } from './settings.ts';
import { isApiCompatible } from './version.ts';

const manifest: Manifest = {
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  permissions: { 'reports.read': { scope: 'project', label: 'permissions.reportsRead' } },
  settings: { type: 'object', properties: {} },
  messages: { en: { permissions: { reportsRead: 'See reports' } }, fr: {} },
  actions: [{ name: 'timeEntry.log', access: { issue: 'issueId' }, input: { type: 'object' } }],
  events: ['issue.created'],
};

describe('the API version a plugin asks for', () => {
  it.each([
    ['^1.0', '1.0', true],
    ['^1.0', '1.3', true],
    ['^1.2', '1.3', true],
    ['^1.4', '1.3', false],
    ['^2.0', '1.3', false],
    ['^0.9', '1.3', false],
    ['1.0', '1.0', false],
    ['^1', '1.0', false],
    ['>=1.0', '1.0', false],
    ['^1.0', 'nonsense', false],
  ])('%s on a Toppo that speaks %s: %s', (range, host, runs) => {
    expect(isApiCompatible(range, host)).toBe(runs);
  });
});

describe('the manifest Toppo accepts', () => {
  it('takes what a plugin declares', () => {
    expect(manifestSchema.parse(manifest)).toStrictEqual(manifest);
  });

  it.each([
    ['a key Toppo does not know', { ...manifest, owner: 'me' }],
    ['an id that is no lowercase words', { ...manifest, id: 'Time_Tracking' }],
    ['an id too short', { ...manifest, id: 'tt' }],
    ['an API version written otherwise', { ...manifest, apiVersion: '1.x' }],
    ['a need that is no call of the SDK', { ...manifest, needs: ['instance.users.manage'] }],
    [
      'a permission named otherwise than resource.action',
      { ...manifest, permissions: { reports: { scope: 'project', label: 'x' } } },
    ],
    [
      'a permission of another scope',
      { ...manifest, permissions: { 'reports.read': { scope: 'world', label: 'x' } } },
    ],
    [
      'too many permissions',
      {
        ...manifest,
        permissions: Object.fromEntries(
          Array.from({ length: PLUGIN_LIMITS.permissions + 1 }, (_, i) => [
            `reports.read${i}`,
            { scope: 'project', label: 'x' },
          ]),
        ),
      },
    ],
    [
      'an access of another kind',
      { ...manifest, actions: [{ name: 'a.b', access: { role: 'admin' }, input: {} }] },
    ],
    ['an event Toppo does not send', { ...manifest, events: ['issue.archived'] }],
    ['a message that is no string', { ...manifest, messages: { en: { count: 3 }, fr: {} } }],
    [
      'a message too long',
      {
        ...manifest,
        messages: { en: { long: 'x'.repeat(PLUGIN_LIMITS.messageLength + 1) }, fr: {} },
      },
    ],
    ['words in one language only', { ...manifest, messages: { en: {} } }],
  ])('refuses %s', (_, declared) => {
    expect(manifestSchema.safeParse(declared).success).toBe(false);
  });

  it('refuses an action on an issue from a plugin that does not read issues, saying which', () => {
    const declared = manifestSchema.safeParse({
      ...manifest,
      needs: ['comment.create'],
      actions: [
        { name: 'report.export', access: 'authenticated', input: {} },
        { name: 'timeEntry.log', access: { issue: 'issueId' }, input: {} },
      ],
    });

    expect(declared.error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['actions', 1, 'access'],
        message: 'timeEntry.log acts on an issue: the plugin needs issue.read',
      }),
    ]);
    expect(
      manifestSchema.safeParse({ ...manifest, needs: ['comment.create'], actions: [] }).success,
    ).toBe(true);
  });
});

describe('the settings Toppo draws', () => {
  /** Settings as Zod writes them, with a label for each in both languages, unless told. */
  function withSettings(shape: z.ZodRawShape, labelled = Object.keys(shape)) {
    const settings = Object.fromEntries(labelled.map((name) => [name, { label: name }]));
    return {
      ...manifest,
      settings: z.toJSONSchema(z.object(shape), { io: 'input', unrepresentable: 'any' }),
      messages: { en: { settings }, fr: { settings } },
    };
  }

  it('takes a text, an address, an email, a number, a yes or no and a choice', () => {
    const declared = withSettings({
      team: z.string().max(80).default('Support'),
      webhookUrl: z.url().optional(),
      replyTo: z.email().optional(),
      reminderDays: z.int().min(1).max(30).optional(),
      rate: z.number().positive().default(1.5),
      billable: z.boolean().default(true),
      period: z.enum(['week', 'month']).default('week'),
    });

    expect(manifestSchema.parse(declared)).toStrictEqual(declared);
  });

  it.each([
    ['one that may be null', { team: z.string().nullable().optional() }],
    ['one that is a list', { teams: z.array(z.string()).optional() }],
    ['one that is an object', { limits: z.object({ daily: z.int() }).optional() }],
    ['one named otherwise than a word', { 'max-hours': z.int().optional() }],
    [
      'more than it can show',
      Object.fromEntries(
        Array.from({ length: PLUGIN_SETTINGS_MAX + 1 }, (_, i) => [
          `setting${i}`,
          z.boolean().default(false),
        ]),
      ),
    ],
  ])('refuses %s', (_, shape) => {
    expect(manifestSchema.safeParse(withSettings(shape)).success).toBe(false);
  });

  it('refuses a setting the plugin cannot run without, or one without a label, saying which', () => {
    const required = manifestSchema.safeParse(withSettings({ webhookUrl: z.url() }));
    const unlabelled = manifestSchema.safeParse(
      withSettings({ webhookUrl: z.url().optional(), team: z.string().optional() }, ['team']),
    );

    expect(required.error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['settings', 'required'],
        message:
          'The setting webhookUrl needs a default, or .optional(): the plugin runs before anyone sets it',
      }),
    ]);
    expect(unlabelled.error?.issues.map(({ path, message }) => ({ path, message }))).toStrictEqual(
      ['en', 'fr'].map((locale) => ({
        path: ['messages', locale],
        message: 'settings.webhookUrl.label is missing: the form names each setting with it',
      })),
    );
  });
});

describe('the protocol', () => {
  it('offers each core permission a call takes as a need, and no other', () => {
    expect(PLUGIN_NEEDS).toStrictEqual(['issue.read', 'comment.create']);
  });

  it('describes every event it sends', () => {
    for (const type of EVENT_TYPES) {
      expect(eventPayloadSchema(type).shape.change).toBeDefined();
    }
    expect(EVENT_TYPES).toHaveLength(16);
  });
});

describe('a plugin’s logo', () => {
  it('is known by its first bytes, whatever its name says', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

    expect(logoTypeOf(png)).toBe('image/png');
    expect(logoTypeOf(webp)).toBe('image/webp');
    expect(logoTypeOf(new TextEncoder().encode('<svg onload="alert(1)">'))).toBeNull();
    expect(logoTypeOf(new Uint8Array())).toBeNull();
  });
});
