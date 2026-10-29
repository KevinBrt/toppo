import {
  type FrameMessage,
  type HostMessage,
  hostMessageSchema,
  type ScreenContext,
  type ScreenFailure,
} from '@toppo-tracker/plugin-sdk/protocol';

/** A call waiting for Toppo's answer. */
interface Pending {
  resolve: (value: unknown) => void;
  reject: (failure: ScreenFailure) => void;
}

/** What a screen says to the page holding it, and hears from it. */
export interface Bridge {
  post(message: FrameMessage): void;
  /** Runs one of the plugin's actions, for the person looking: to change something, or not. */
  action(name: string, input: unknown, changes?: boolean): Promise<unknown>;
  /** The names of people, those the person looking may see. */
  people(ids: readonly string[]): Promise<{ id: string; name: string | null }[]>;
  /** Called with the screen's context, now if Toppo told it already, and at each change. */
  onContext(listener: (context: ScreenContext) => void): () => void;
}

/**
 * The frame's side of the bridge. The page that holds it is its only correspondent: what comes
 * from anywhere else, or does not fit the protocol, is ignored. Nothing it sends is secret, and
 * the frame has no origin to aim at: the page checks who sends it.
 */
export function createBridge(host: Window = window.parent): Bridge {
  let lastId = 0;
  const pending = new Map<number, Pending>();
  const listeners = new Set<(context: ScreenContext) => void>();
  let context: ScreenContext | undefined;

  const answered = (message: Exclude<HostMessage, ScreenContext>) => {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (!waiting) {
      return;
    }
    if (message.kind === 'people') {
      waiting.resolve(message.people);
    } else if (message.ok) {
      waiting.resolve(message.result);
    } else {
      waiting.reject(message.error);
    }
  };

  window.addEventListener('message', (event) => {
    const parsed = event.source === host ? hostMessageSchema.safeParse(event.data) : undefined;
    if (!parsed?.success) {
      return;
    }
    if (parsed.data.kind === 'context') {
      context = parsed.data;
      for (const listener of listeners) {
        listener(parsed.data);
      }
      return;
    }
    answered(parsed.data);
  });

  const post = (message: FrameMessage) => host.postMessage(message, '*');
  const call = (message: (id: number) => FrameMessage) =>
    new Promise<unknown>((resolve, reject) => {
      lastId += 1;
      pending.set(lastId, { resolve, reject });
      post(message(lastId));
    });

  return {
    post,
    action: (name, input, changes = false) =>
      call((id) => ({ kind: 'action', id, name, input, changes })),
    people: async (ids) =>
      (await call((id) => ({ kind: 'people', id, ids: [...ids] }))) as {
        id: string;
        name: string | null;
      }[],
    onContext(listener) {
      listeners.add(listener);
      if (context) {
        listener(context);
      }
      return () => listeners.delete(listener);
    },
  };
}
