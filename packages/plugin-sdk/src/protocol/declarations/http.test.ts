import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { secret } from '../../settings/secret.ts';
import { HOST_CALLS } from '../calls.ts';
import { manifestSchema } from '../manifest.ts';
import { HTTP_LIMITS } from './http.ts';

/** A plugin that may reach `http`, with an address and a number in its settings. */
const manifest = (http: unknown) => ({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  needs: [],
  permissions: {},
  settings: z.toJSONSchema(
    z.object({
      summaryUrl: secret(z.url()).optional(),
      hoursPerDay: z.number().default(8),
    }),
    { io: 'input', unrepresentable: 'any' },
  ),
  messages: {
    en: { settings: { summaryUrl: { label: 'Summary' }, hoursPerDay: { label: 'Hours' } } },
    fr: { settings: { summaryUrl: { label: 'Résumé' }, hoursPerDay: { label: 'Heures' } } },
  },
  actions: [],
  events: [],
  http,
});

describe('what a plugin may reach', () => {
  it.each([
    ['hosts it names', ['hooks.slack.com', 'api.toggl.com']],
    ['the address typed in one of its settings', { fromSettings: ['summaryUrl'] }],
    ['any public site', 'any'],
  ])('is %s', (_, http) => {
    expect(manifestSchema.parse(manifest(http)).http).toStrictEqual(http);
  });

  it('is nothing for a plugin uploaded before it could reach anything', () => {
    const { http: _none, ...before } = manifest(null);

    expect(manifestSchema.parse(before).http).toBeNull();
  });

  it.each([
    ['an address rather than a host', ['https://hooks.slack.com']],
    ['an IP address', ['10.0.0.1']],
    ['a host in capitals', ['Hooks.Slack.com']],
    ['a host without its domain', ['localhost']],
    ['no host', []],
    [
      'more hosts than an approval reads',
      Array.from({ length: 21 }, (_, i) => `h${i}.example.com`),
    ],
    ['a setting it does not have', { fromSettings: ['webhookUrl'] }],
    ['a setting that holds no text', { fromSettings: ['hoursPerDay'] }],
    ['all of everything', 'all'],
  ])('refuses %s', (_, http) => {
    expect(manifestSchema.safeParse(manifest(http)).success).toBe(false);
  });

  it('says which setting cannot hold an address', () => {
    expect(
      manifestSchema.safeParse(manifest({ fromSettings: ['hoursPerDay'] })).error?.issues[0],
    ).toMatchObject({
      path: ['http', 'fromSettings', 0],
      message: 'hoursPerDay is no text setting of the plugin: it cannot hold an address',
    });
  });
});

describe('a request a plugin sends', () => {
  const { args } = HOST_CALLS['http.fetch'];

  it('is a GET without headers or body unless it says otherwise', () => {
    expect(args.parse({ url: 'https://hooks.slack.com/services/T0' })).toStrictEqual({
      url: 'https://hooks.slack.com/services/T0',
      method: 'GET',
      headers: {},
      body: null,
    });
  });

  it.each([
    ['a body past its size, in bytes', { body: 'é'.repeat(HTTP_LIMITS.requestBytes / 2 + 1) }],
    ['a header that would start another', { headers: { 'x-a': 'b\r\nhost: evil' } }],
    ['a header that is no name', { headers: { 'x a': 'b' } }],
    [
      'more headers than it takes',
      { headers: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`x-${i}`, 'v'])) },
    ],
    ['a method it does not send', { method: 'CONNECT' }],
    ['an address past its length', { url: `https://example.com/${'a'.repeat(2000)}` }],
  ])('refuses %s', (_, more) => {
    expect(args.safeParse({ url: 'https://example.com/', ...more }).success).toBe(false);
  });
});
