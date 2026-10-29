import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { provideUrl, SandboxUrl } from './url.ts';

const NODE_URL = globalThis.URL;

afterEach(() => {
  globalThis.URL = NODE_URL;
});

const ADDRESSES = [
  'https://hooks.slack.com/services/T0/B0/x',
  'http://chat.internal:8065/hooks/abc?channel=time#top',
  'https://ada:secret@example.com/',
  'HTTPS://Example.COM:443',
  'http://10.0.0.12:80/path',
  'https://[fd00::12]:8443/hooks',
  'mailto:ada@example.com',
];

describe('the URL of Toppo’s sandbox', () => {
  it.each(ADDRESSES)('reads %s as a browser does', (address) => {
    const ours = new SandboxUrl(address);
    const node = new NODE_URL(address);

    for (const part of [
      'protocol',
      'username',
      'password',
      'hostname',
      'port',
      'host',
      'pathname',
      'search',
      'hash',
      'origin',
      'href',
    ] as const) {
      expect(ours[part], part).toBe(node[part]);
    }
    expect(String(ours)).toBe(node.href);
    expect(JSON.stringify({ ours })).toBe(JSON.stringify({ ours: node }));
  });

  it.each([
    'hooks.slack.com/services',
    'https://',
    'http://:80/',
    'https://example.com:99999/',
    '//example.com',
    '',
  ])('refuses %j', (address) => {
    expect(() => new SandboxUrl(address)).toThrow('Invalid URL');
    expect(SandboxUrl.canParse(address)).toBe(false);
    expect(SandboxUrl.parse(address)).toBeNull();
  });

  it('reads absolute addresses only', () => {
    expect(SandboxUrl.canParse('/hooks', 'https://example.com')).toBe(false);
  });

  it('lets Zod check addresses where JavaScript has no URL, and leaves one that has its own', () => {
    const scope = {};
    provideUrl(scope);
    Reflect.deleteProperty(globalThis, 'URL');
    provideUrl(globalThis);

    expect(Reflect.get(scope, 'URL')).toBe(SandboxUrl);
    expect(globalThis.URL).toBe(SandboxUrl);
    expect(z.url().safeParse('https://hooks.slack.com/services/T0').success).toBe(true);
    expect(z.url().safeParse('hooks.slack.com/services/T0').success).toBe(false);
    expect(z.httpUrl().safeParse('https://hooks.slack.com/x').success).toBe(true);
    expect(z.httpUrl().safeParse('ftp://files.example.com/x').success).toBe(false);

    provideUrl(globalThis);
    globalThis.URL = NODE_URL;
    provideUrl(globalThis);
    expect(globalThis.URL).toBe(NODE_URL);
  });
});
