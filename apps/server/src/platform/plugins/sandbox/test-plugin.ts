import { MESSAGE_MAX_LENGTH } from './sandbox-protocol.ts';

/**
 * A plugin written straight to the sandbox's protocol, without the SDK, for the sandbox's tests:
 * each action tries one thing, from calling Toppo to escaping or exhausting the sandbox.
 */
export const TEST_PLUGIN = `
let atLoad = 'not tried';
__host.call('double', '1').then(
  () => { atLoad = 'answered'; },
  (error) => { atLoad = 'refused: ' + error.message; },
);

globalThis.__toppo = {
  manifest() {
    return JSON.stringify({ id: 'test-plugin' });
  },
  async run(kind, name, payload, context) {
    const input = JSON.parse(payload);
    switch (name) {
      case 'echo':
        return JSON.stringify({ kind, input, context: JSON.parse(context) });
      case 'double':
        return await __host.call('double', JSON.stringify(input));
      case 'refused':
        return await __host.call('refused', '{}');
      case 'at-load':
        return JSON.stringify(atLoad);
      case 'reach':
        return JSON.stringify(
          ['process', 'require', 'module', 'fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout',
            'setInterval', 'queueMicrotask', 'crypto', 'std', 'os', 'Deno', 'Bun', 'navigator']
            .filter((global) => typeof globalThis[global] !== 'undefined'),
        );
      case 'import':
        return import('node:fs').then(() => '"imported"', () => '"refused"');
      case 'loop':
        for (;;) {}
      case 'regex':
        return String(/(a+)+$/.test('a'.repeat(40) + 'b'));
      case 'arrays': {
        const kept = [];
        for (;;) kept.push(new Array(100000).fill(1));
      }
      case 'strings': {
        const kept = [];
        for (;;) kept.push('x'.repeat(100000) + kept.length);
      }
      case 'recurse': {
        const deeper = (depth) => deeper(depth + 1) + 1;
        return String(deeper(0));
      }
      case 'throws':
        throw new Error('Nothing to see');
      case 'throws-trap':
        throw { toJSON() { for (;;) {} } };
      case 'number':
        return 42;
      case 'not-json':
        return 'not json';
      case 'huge':
        return '"' + 'x'.repeat(${MESSAGE_MAX_LENGTH}) + '"';
      case 'call-huge':
        return await __host.call('double', '"' + 'x'.repeat(${MESSAGE_MAX_LENGTH}) + '"');
      case 'call-not-json':
        return await __host.call('double', '{');
      case 'call-object':
        return await __host.call({}, []);
      case 'never':
        return new Promise(() => {});
      case 'wait':
        return await __host.call('never', '{}');
      case 'flood':
        for (let i = 0; i < input.calls; i += 1) {
          __host.call('slow', String(i)).catch(() => {});
        }
        return 'null';
      case 'flood-refused':
        // Answers which calls Toppo refused, by their rank, once it refused that many.
        return await new Promise((resolve) => {
          const refused = [];
          for (let i = 0; i < input.calls; i += 1) {
            __host.call('slow', String(i)).catch(() => {
              refused.push(i);
              if (refused.length === input.refused) {
                resolve(JSON.stringify(refused));
              }
            });
          }
        });
    }
    throw new Error('No such test: ' + name);
  },
};
`;
