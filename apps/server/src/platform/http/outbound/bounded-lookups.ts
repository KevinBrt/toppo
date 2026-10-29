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
 * `resolve`, with `atOnce` lookups under way at most: the others wait their turn, and give it up
 * when their request is aborted. A lookup started is never cancelled: it keeps its turn until the
 * resolver answers.
 */
export function boundedLookups(resolve: Resolve, atOnce = LOOKUPS_AT_ONCE) {
  let underWay = 0;
  const waiting: Array<() => void> = [];

  function next(): void {
    underWay -= 1;
    waiting.shift()?.();
  }

  return (
    hostname: string,
    options: LookupAllOptions,
    signal: AbortSignal,
    callback: (error: Error | null, addresses: LookupAddress[]) => void,
  ): void => {
    const start = () => {
      if (signal.aborted) {
        callback(new Error('The request was aborted'), []);
        return;
      }
      underWay += 1;
      resolve(hostname, options, (error, addresses) => {
        next();
        callback(error, addresses);
      });
    };
    if (underWay < atOnce) {
      start();
      return;
    }
    const turn = () => {
      signal.removeEventListener('abort', giveUp);
      start();
    };
    const giveUp = () => {
      waiting.splice(waiting.indexOf(turn), 1);
      callback(new Error('The request was aborted'), []);
    };
    waiting.push(turn);
    signal.addEventListener('abort', giveUp, { once: true });
  };
}
