import { describe, expect, it } from 'vitest';
import { approvePluginRequestSchema } from './plugins.ts';

describe('the hosts inside the network an approval names', () => {
  it('are names or addresses, as people type them, kept lowercase', () => {
    expect(
      approvePluginRequestSchema.parse({
        projects: 'all',
        privateHosts: [' Chat.Internal ', '10.0.0.12', 'fd00::12'],
      }).privateHosts,
    ).toStrictEqual(['chat.internal', '10.0.0.12', 'fd00::12']);
    expect(approvePluginRequestSchema.parse({ projects: 'all' }).privateHosts).toStrictEqual([]);
  });

  it.each([
    ['an address with its scheme', 'https://chat.internal'],
    ['a host with its port', 'chat.internal:8065'],
    ['a host with a path', 'chat.internal/hooks'],
    ['an IPv6 address in brackets', '[fd00::12]'],
    ['nothing', ' '],
  ])('refuse %s', (_, host) => {
    expect(
      approvePluginRequestSchema.safeParse({ projects: 'all', privateHosts: [host] }).success,
    ).toBe(false);
  });

  it('are ten at most', () => {
    const privateHosts = Array.from({ length: 11 }, (_, i) => `host${i}.internal`);

    expect(approvePluginRequestSchema.safeParse({ projects: 'all', privateHosts }).success).toBe(
      false,
    );
  });
});
