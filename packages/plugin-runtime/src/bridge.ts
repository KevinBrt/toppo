import {
  type FrameMessage,
  frameMessageSchema,
  type HostMessage,
  hostMessageSchema,
  type MenuItem,
  type ScreenContext,
  type ScreenFailure,
} from '@toppo-tracker/plugin-sdk/protocol';
import type { ConfirmOptions } from '@toppo-tracker/plugin-ui';

type MenuMessage = Extract<FrameMessage, { kind: 'menu' }>;

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
  /** Has the person confirm, in a dialog of Toppo's: whether they did. */
  confirm(options: ConfirmOptions): Promise<boolean>;
  /** Opens one of the plugin's dialogs: what it closed with, `null` when dismissed. */
  dialog(name: string, input: unknown): Promise<unknown>;
  /** In a dialog, closes it, with what its opener is answered: JSON, or refused. */
  close(result: unknown): void;
  /** A menu Toppo draws over the page beside `anchor`: the item chosen, or `null`. */
  menu(anchor: MenuMessage['anchor'], items: readonly MenuItem[]): Promise<string | null>;
  /** Toppo's search of issues or people: what the person picked, `null` for nothing. */
  pick(
    of: 'issue' | 'people',
    options: { projectId?: string; multiple?: boolean },
  ): Promise<unknown>;
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
  // Checked before it leaves: Toppo ignores what does not fit, and the call would wait forever.
  const call = (message: (id: number) => unknown) =>
    new Promise<unknown>((resolve, reject) => {
      lastId += 1;
      const checked = frameMessageSchema.safeParse(message(lastId));
      if (!checked.success) {
        reject({ code: 'INVALID_REQUEST' } satisfies ScreenFailure);
        return;
      }
      pending.set(lastId, { resolve, reject });
      post(checked.data);
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
    confirm: async (options) =>
      (await call((id) => ({ kind: 'confirm', id, ...options }))) === true,
    dialog: (name, input) => call((id) => ({ kind: 'dialog', id, name, input })),
    close(result) {
      const checked = frameMessageSchema.safeParse(
        result === undefined ? { kind: 'close' } : { kind: 'close', result },
      );
      if (!checked.success) {
        throw { code: 'INVALID_RESULT' } satisfies ScreenFailure;
      }
      post(checked.data);
    },
    menu: async (anchor, items) => {
      const chosen = await call((id) => ({ kind: 'menu', id, anchor, items: [...items] }));
      return typeof chosen === 'string' ? chosen : null;
    },
    pick: (of, options) => call((id) => ({ kind: 'pick', id, of, ...options })),
    onContext(listener) {
      listeners.add(listener);
      if (context) {
        listener(context);
      }
      return () => listeners.delete(listener);
    },
  };
}
