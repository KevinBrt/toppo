import type { LookupAddress } from 'node:dns';
import { describe, expect, it, vi } from 'vitest';
import { boundedLookups, type Resolve } from './bounded-lookups.ts';

const OPTIONS = { all: true } as const;
const ADDRESSES: LookupAddress[] = [{ address: '93.184.215.14', family: 4 }];

/** A resolver whose lookups answer only when the test says so, oldest first. */
function heldResolver() {
  const held: Array<() => void> = [];
  const resolve = vi.fn<Resolve>((_hostname, _options, callback) => {
    held.push(() => callback(null, ADDRESSES));
  });
  return { resolve, answerOne: () => held.shift()?.() };
}

const started = (resolve: ReturnType<typeof heldResolver>['resolve']) =>
  resolve.mock.calls.map(([host]) => host);

describe('lookups for requests leaving Toppo', () => {
  it('run two at a time, the others waiting their turn', () => {
    const { resolve, answerOne } = heldResolver();
    const lookup = boundedLookups(resolve);
    const answered = vi.fn();

    for (const host of ['a.example', 'b.example', 'c.example']) {
      lookup(host, OPTIONS, `plugin:${host}`, new AbortController().signal, answered);
    }

    expect(started(resolve)).toStrictEqual(['a.example', 'b.example']);
    answerOne();
    expect(answered).toHaveBeenCalledWith(null, ADDRESSES);
    expect(started(resolve)).toStrictEqual(['a.example', 'b.example', 'c.example']);
  });

  it('give up their turn when their request is aborted, and keep it once started', () => {
    const { resolve, answerOne } = heldResolver();
    const lookup = boundedLookups(resolve);
    const aborted = new AbortController();
    const given = vi.fn();

    lookup('a.example', OPTIONS, 'plugin:a', aborted.signal, vi.fn());
    lookup('b.example', OPTIONS, 'plugin:b', new AbortController().signal, vi.fn());
    lookup('c.example', OPTIONS, 'plugin:c', aborted.signal, given);
    lookup('d.example', OPTIONS, 'plugin:d', new AbortController().signal, vi.fn());
    aborted.abort();

    expect(given).toHaveBeenCalledWith(expect.any(Error), []);
    // The aborted lookup of a.example still holds its thread: d waits for an answer.
    expect(resolve).toHaveBeenCalledTimes(2);
    answerOne();
    expect(started(resolve)).toStrictEqual(['a.example', 'b.example', 'd.example']);
  });

  it('leave one caller one at a time: a host that never answers holds up no other caller', () => {
    const { resolve } = heldResolver();
    const lookup = boundedLookups(resolve);
    const slow = vi.fn();

    // A webhook whose DNS never answers sends again and again.
    for (let delivery = 0; delivery < 3; delivery++) {
      lookup('slow.example', OPTIONS, 'webhook:slow', new AbortController().signal, slow);
    }
    lookup('fast.example', OPTIONS, 'plugin:time-tracking', new AbortController().signal, vi.fn());

    expect(started(resolve)).toStrictEqual(['slow.example', 'fast.example']);
  });

  it('never keep waiting behind a request aborted before it asked', () => {
    const { resolve, answerOne } = heldResolver();
    const lookup = boundedLookups(resolve);
    const aborted = new AbortController();
    aborted.abort();
    const given = vi.fn();

    lookup('a.example', OPTIONS, 'plugin:a', new AbortController().signal, vi.fn());
    lookup('b.example', OPTIONS, 'plugin:b', new AbortController().signal, vi.fn());
    lookup('c.example', OPTIONS, 'plugin:c', aborted.signal, given);
    lookup('d.example', OPTIONS, 'plugin:d', new AbortController().signal, vi.fn());

    expect(given).toHaveBeenCalledWith(expect.any(Error), []);
    answerOne();
    expect(started(resolve)).toStrictEqual(['a.example', 'b.example', 'd.example']);
  });
});
