import type { LookupAddress, LookupAllOptions } from 'node:dns';

/** The system resolver, as `node:dns` `lookup` with `all: true` calls it. */
export type Resolve = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * Lookups under way at once. Each holds a thread of libuv's pool (four by default) until the
 * system resolver gives up, whatever the request's deadline: a host that never answers must not
 * take the threads that read files, hash passwords and resolve the database.
 */
export const LOOKUPS_AT_ONCE = 2;

/**
 * Lookups one caller (a plugin, a webhook) may have under way at once: fewer than all of them,
 * so that one whose hosts never answer leaves the others their turn.
 */
export const LOOKUPS_PER_CALLER = 1;

interface Waiter {
  caller: string;
  turn: () => void;
}

/**
 * `resolve`, with `atOnce` lookups under way at most, `perCaller` of them for one caller: the
 * others wait their turn, the oldest first among those whose caller may start one, and give it up
 * when their request is aborted. A lookup started is never cancelled: it keeps its turn until the
 * resolver answers.
 */
export function boundedLookups(
  resolve: Resolve,
  atOnce = LOOKUPS_AT_ONCE,
  perCaller = LOOKUPS_PER_CALLER,
) {
  let underWay = 0;
  const held = new Map<string, number>();
  const waiting: Waiter[] = [];

  const mayStart = (caller: string) => underWay < atOnce && (held.get(caller) ?? 0) < perCaller;

  function wake(): void {
    let waiter = waiting.find(({ caller }) => mayStart(caller));
    while (waiter) {
      waiting.splice(waiting.indexOf(waiter), 1);
      waiter.turn();
      waiter = waiting.find(({ caller }) => mayStart(caller));
    }
  }

  function release(caller: string): void {
    underWay -= 1;
    const left = (held.get(caller) ?? 1) - 1;
    if (left === 0) {
      held.delete(caller);
    } else {
      held.set(caller, left);
    }
    wake();
  }

  return (
    hostname: string,
    options: LookupAllOptions,
    caller: string,
    signal: AbortSignal,
    callback: (error: Error | null, addresses: LookupAddress[]) => void,
  ): void => {
    // Never queued: an abort before the listener below is set would leave it waiting for good.
    if (signal.aborted) {
      callback(new Error('The request was aborted'), []);
      return;
    }
    const start = () => {
      underWay += 1;
      held.set(caller, (held.get(caller) ?? 0) + 1);
      resolve(hostname, options, (error, addresses) => {
        release(caller);
        callback(error, addresses);
      });
    };
    if (mayStart(caller)) {
      start();
      return;
    }
    const waiter: Waiter = {
      caller,
      turn: () => {
        signal.removeEventListener('abort', giveUp);
        start();
      },
    };
    const giveUp = () => {
      waiting.splice(waiting.indexOf(waiter), 1);
      callback(new Error('The request was aborted'), []);
    };
    waiting.push(waiter);
    signal.addEventListener('abort', giveUp, { once: true });
  };
}
