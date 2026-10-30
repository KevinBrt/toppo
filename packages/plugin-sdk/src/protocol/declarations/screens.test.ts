import { describe, expect, it } from 'vitest';
import { frameMessageSchema, hostMessageSchema, OVERLAY_LIMITS } from '../bridge.ts';
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

const page = (name: string, zone = 'main') => ({
  name,
  zone,
  access: 'authenticated',
  title: 'pages.title',
  nav: { label: 'pages.label', icon: 'clock' },
});

const panel = { name: 'entries', on: 'issue', access: 'authenticated', title: 'panel.title' };

const dialog = { name: 'logTime', access: 'authenticated', title: 'dialogs.logTime' };

describe('the screens a plugin declares', () => {
  it('are pages in a zone, with an entry or not, and panels beside an issue; none from before them', () => {
    const declared = manifestSchema.parse(
      manifest({
        pages: [page('report'), page('budgets', 'project.settings')],
        panels: [panel],
      } as never),
    );

    expect(declared.pages.map(({ name, zone }) => `${zone}:${name}`)).toStrictEqual([
      'main:report',
      'project.settings:budgets',
    ]);
    expect(manifestSchema.parse(manifest({})).pages).toStrictEqual([]);
    expect(manifestSchema.parse(manifest({})).panels).toStrictEqual([]);
  });

  it('are dialogs too, medium and in the middle unless they say; none from before them', () => {
    const declared = manifestSchema.parse(
      manifest({
        dialogs: [dialog, { ...dialog, name: 'entries', size: 'large', side: true }],
      } as never),
    );

    expect(declared.dialogs).toStrictEqual([
      { ...dialog, size: 'medium', side: false },
      { ...dialog, name: 'entries', size: 'large', side: true },
    ]);
    expect(manifestSchema.parse(manifest({})).dialogs).toStrictEqual([]);
  });

  it.each([
    [
      'two screens of one name',
      { pages: [page('report')], panels: [{ ...panel, name: 'report' }] },
    ],
    [
      'a dialog named as a page',
      { pages: [page('report')], dialogs: [{ ...dialog, name: 'report' }] },
    ],
    ['a dialog of a size Toppo has not', { dialogs: [{ ...dialog, size: 'huge' }] }],
    [
      'too many dialogs',
      { dialogs: Array.from({ length: 11 }, (_, at) => ({ ...dialog, name: `dialog${at}` })) },
    ],
    [
      'more entries in a zone than it takes',
      { pages: Array.from({ length: 9 }, (_, at) => page(`page${at}`, 'settings')) },
    ],
    [
      'an icon not of Toppo’s set',
      { pages: [{ ...page('report'), nav: { label: 'x', icon: 'skull' } }] },
    ],
    ['a zone Toppo has not', { pages: [page('report', 'topbar')] }],
    ['panels from a plugin that reads no issues', { needs: [], panels: [panel] }],
  ])('refuse %s', (_, more) => {
    expect(manifestSchema.safeParse(manifest(more as never)).success).toBe(false);
  });
});

describe('the bridge between a screen and Toppo', () => {
  it('takes what a screen may ask', () => {
    for (const message of [
      { kind: 'ready' },
      { kind: 'resize', height: 320 },
      { kind: 'action', id: 1, name: 'timeEntry.log', input: { minutes: 30 } },
      { kind: 'people', id: 2, ids: ['01a1569b-9900-7000-8000-000000000001'] },
      { kind: 'search', search: { project: 'WEB' } },
      { kind: 'open', target: { to: 'issue', key: 'WEB-1' } },
      { kind: 'open', target: { to: 'page', name: 'report', search: { project: 'WEB' } } },
      { kind: 'confirm', id: 4, title: 'Delete this entry?', tone: 'danger' },
      { kind: 'dialog', id: 5, name: 'logTime', input: { projectId: null, minutes: [30, 45] } },
      { kind: 'close', result: { minutes: 30 } },
      { kind: 'close' },
      {
        kind: 'menu',
        id: 6,
        anchor: { x: 10, y: 20, width: 32, height: 32 },
        items: [{ id: 'delete', label: 'Delete', tone: 'danger' }],
      },
      { kind: 'pick', id: 7, of: 'issue' },
      {
        kind: 'pick',
        id: 8,
        of: 'people',
        multiple: true,
        projectId: '01a1569b-9900-7000-8000-000000000100',
      },
    ]) {
      expect(frameMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });

  it.each([
    ['an unknown kind', { kind: 'fetch', url: 'https://example.com' }],
    ['more than it says', { kind: 'ready', cookie: 'session' }],
    ['an action that is no name', { kind: 'action', id: 1, name: '../logout', input: {} }],
    ['a way out of Toppo', { kind: 'open', target: { to: 'url', href: 'https://example.com' } }],
    [
      'too many people at once',
      { kind: 'people', id: 3, ids: Array(101).fill('01a1569b-9900-7000-8000-000000000001') },
    ],
    ['a confirmation without a title', { kind: 'confirm', id: 4, title: '' }],
    [
      'a confirmation too long',
      { kind: 'confirm', id: 4, title: 'x', description: 'x'.repeat(1001) },
    ],
    [
      'a dialog given too much',
      {
        kind: 'dialog',
        id: 5,
        name: 'logTime',
        input: 'x'.repeat(OVERLAY_LIMITS.dialogInputBytes),
      },
    ],
    [
      'a dialog given what is no JSON',
      { kind: 'dialog', id: 5, name: 'logTime', input: undefined },
    ],
    [
      'a dialog closing with too much',
      { kind: 'close', result: 'x'.repeat(OVERLAY_LIMITS.dialogResultBytes) },
    ],
    [
      'too many choices in a menu',
      {
        kind: 'menu',
        id: 6,
        anchor: { x: 0, y: 0, width: 1, height: 1 },
        items: Array.from({ length: OVERLAY_LIMITS.menuItems + 1 }, (_, at) => ({
          id: `item${at}`,
          label: 'Item',
        })),
      },
    ],
    [
      'a menu choice named with markup',
      {
        kind: 'menu',
        id: 6,
        anchor: { x: 0, y: 0, width: 1, height: 1 },
        items: [{ id: '<b>', label: 'x' }],
      },
    ],
    ['a search of something else', { kind: 'pick', id: 7, of: 'projects' }],
  ])('refuses %s', (_, message) => {
    expect(frameMessageSchema.safeParse(message).success).toBe(false);
  });

  it('answers a call, or says why it failed', () => {
    expect(
      hostMessageSchema.safeParse({ kind: 'answer', id: 1, ok: true, result: [] }).success,
    ).toBe(true);
    expect(
      hostMessageSchema.safeParse({
        kind: 'answer',
        id: 1,
        ok: false,
        error: { code: 'errors.dailyLimit', params: { limit: 600 } },
      }).success,
    ).toBe(true);
  });
});
