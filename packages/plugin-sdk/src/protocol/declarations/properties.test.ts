import { describe, expect, it } from 'vitest';
import { type Manifest, manifestSchema } from '../manifest.ts';

const manifest = (more: Partial<Manifest>) => ({
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
  ...more,
});

const timeSpent = {
  name: 'properties.timeSpent',
  type: 'number',
  display: 'duration',
  writtenBy: 'plugin',
} as const;

describe('the properties a plugin adds', () => {
  it('are named by its messages, typed, written by people or by it, and none from a manifest from before them', () => {
    const estimate = { name: 'properties.estimate', type: 'date', writtenBy: 'people' } as const;

    expect(
      manifestSchema.parse(manifest({ properties: { timeSpent, estimate } })).properties,
    ).toStrictEqual({ timeSpent, estimate });
    expect(manifestSchema.parse(manifest({})).properties).toStrictEqual({});
  });

  it.each([
    ['a type of Toppo a plugin does not add', { timeSpent: { ...timeSpent, type: 'list' } }],
    ['a display of a type that has none', { note: { ...timeSpent, type: 'text' } }],
    ['a writer that is neither', { timeSpent: { ...timeSpent, writtenBy: 'robots' } }],
    ['a name that is no property name', { 'time-spent': timeSpent }],
    [
      'more than five',
      Object.fromEntries(Array.from({ length: 6 }, (_, at) => [`spent${at}`, timeSpent])),
    ],
  ])('refuse %s', (_, properties) => {
    expect(manifestSchema.safeParse(manifest({ properties } as never)).success).toBe(false);
  });

  it('come from a plugin that reads issues, saying so', () => {
    const declared = manifestSchema.safeParse(manifest({ needs: [], properties: { timeSpent } }));

    expect(declared.error?.issues).toStrictEqual([
      expect.objectContaining({
        path: ['properties'],
        message: 'Properties are on issues: the plugin needs issue.read',
      }),
    ]);
  });
});
