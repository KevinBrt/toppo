import type { FrameMessage, HostMessage } from '@toppo-tracker/plugin-sdk/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridge } from './bridge.ts';

const ADA = '0190a1a2-0000-7000-8000-000000000001';

let host: Window;
let posted: FrameMessage[];

/** A message to the frame, from `source`: Toppo's page, or anywhere else. */
function receive(message: unknown, source: Window = host): void {
  window.dispatchEvent(new MessageEvent('message', { data: message, source }));
}

/** The page holding the frame: what the bridge posts to it is kept. */
beforeEach(() => {
  const frame = document.body.appendChild(document.createElement('iframe'));
  if (!frame.contentWindow) {
    throw new Error('The frame has no window');
  }
  host = frame.contentWindow;
  posted = [];
  host.addEventListener('message', (event: MessageEvent<FrameMessage>) => {
    // Cloned here: what comes from the frame is built with its own `Object`.
    posted.push(structuredClone(event.data));
  });
  return () => frame.remove();
});

describe('the bridge to Toppo', () => {
  it('answers an action with what Toppo answers, never with what comes from elsewhere', async () => {
    const bridge = createBridge(host);

    const answer = bridge.action('timeEntry.list', { page: 1 });
    await expect
      .poll(() => posted)
      .toStrictEqual([
        { kind: 'action', id: 1, name: 'timeEntry.list', input: { page: 1 }, changes: false },
      ]);
    receive({ kind: 'answer', id: 1, ok: true, result: 'forged' }, window);
    receive({ kind: 'answer', id: 1, ok: true, result: { total: 90 } });

    await expect(answer).resolves.toStrictEqual({ total: 90 });
  });

  it('rejects an action Toppo refused, with its reason', async () => {
    const bridge = createBridge(host);

    const answer = bridge.action('timeEntry.log', { minutes: 30 }, true);
    await expect.poll(() => posted).toMatchObject([{ kind: 'action', id: 1, changes: true }]);
    receive({ kind: 'answer', id: 1, ok: false, error: { code: 'FORBIDDEN' } });

    await expect(answer).rejects.toStrictEqual({ code: 'FORBIDDEN' });
  });

  it('asks for the names of people', async () => {
    const bridge = createBridge(host);

    const names = bridge.people([ADA]);
    await expect.poll(() => posted).toStrictEqual([{ kind: 'people', id: 1, ids: [ADA] }]);
    receive({ kind: 'people', id: 1, people: [{ id: ADA, name: 'Ada Lovelace' }] });

    await expect(names).resolves.toStrictEqual([{ id: ADA, name: 'Ada Lovelace' }]);
  });

  it('tells the screen where it is, as Toppo tells it, and ignores what does not fit', () => {
    const bridge = createBridge(host);
    const context: HostMessage = {
      kind: 'context',
      locale: 'fr',
      user: { id: ADA, name: 'Ada Lovelace' },
      screen: 'report',
      search: {},
      issue: null,
      project: null,
      input: null,
    };
    const early = vi.fn();
    const stop = bridge.onContext(early);

    receive({ ...context, locale: 'de' });
    receive({ kind: 'answer', id: 7, ok: true, result: 'nobody asked' });
    receive(context);
    const late = vi.fn();
    bridge.onContext(late);
    stop();
    receive({ ...context, search: { project: 'WEB' } });

    expect(early.mock.calls).toStrictEqual([[context]]);
    expect(late.mock.calls).toStrictEqual([
      [context],
      [{ ...context, search: { project: 'WEB' } }],
    ]);
  });
});
