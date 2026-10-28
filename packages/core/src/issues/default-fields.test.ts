import { PRIORITY_LEVELS, SUPPORTED_LOCALES } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIELD_NAMES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  DEFAULT_TRANSITIONS,
} from './default-fields.ts';

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

describe('default fields', () => {
  it('give every row its own id', () => {
    const ids = [
      ...DEFAULT_STATUSES.flatMap(({ id, workflowStatusId }) => [id, workflowStatusId]),
      ...DEFAULT_PRIORITIES.map(({ id }) => id),
      ...DEFAULT_CATEGORIES.map(({ id }) => id),
    ];

    expect(distinct(ids)).toBe(true);
  });

  it('start issues on a single status, and let them reach a done one', () => {
    expect(DEFAULT_STATUSES.filter(({ initial }) => initial).map(({ kind }) => kind)).toStrictEqual(
      ['new'],
    );
    expect(DEFAULT_STATUSES.filter(({ closes }) => closes).map(({ kind }) => kind)).toStrictEqual([
      'resolved',
    ]);
  });

  it('let issues go from the initial status to every other, and out of each one', () => {
    const reached = new Set<string>(['new']);
    for (let added = true; added; ) {
      const next = DEFAULT_TRANSITIONS.filter(({ from }) => reached.has(from)).map(({ to }) => to);
      added = next.some((kind) => !reached.has(kind));
      for (const kind of next) {
        reached.add(kind);
      }
    }
    const kinds = DEFAULT_STATUSES.map(({ kind }) => kind);

    expect([...reached].sort()).toStrictEqual([...kinds].sort());
    expect(kinds.every((kind) => DEFAULT_TRANSITIONS.some(({ from }) => from === kind))).toBe(true);
    expect(DEFAULT_TRANSITIONS.every(({ from, to }) => from !== to)).toBe(true);
    expect(distinct(DEFAULT_TRANSITIONS.map(({ from, to }) => `${from}>${to}`))).toBe(true);
    expect(distinct(DEFAULT_TRANSITIONS.map(({ id }) => id))).toBe(true);
  });

  it('have the four priority levels in order, one of them the default', () => {
    expect(DEFAULT_PRIORITIES.map(({ level }) => level)).toStrictEqual([...PRIORITY_LEVELS]);
    expect(DEFAULT_PRIORITIES.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('have a single default category', () => {
    expect(DEFAULT_CATEGORIES.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('are named in every supported language, distinctly', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { statuses, priorities, categories } = DEFAULT_FIELD_NAMES[locale];
      for (const names of [statuses, priorities, categories]) {
        const values = Object.values(names).map((name) => name.trim().toLowerCase());
        expect(
          values.every((name) => name !== ''),
          locale,
        ).toBe(true);
        expect(distinct(values), locale).toBe(true);
      }
    }
  });

  it('are seeded with their English names', () => {
    const { statuses, priorities, categories } = DEFAULT_FIELD_NAMES.en;

    expect(DEFAULT_STATUSES.map(({ name }) => name)).toStrictEqual(
      DEFAULT_STATUSES.map(({ kind }) => statuses[kind]),
    );
    expect(DEFAULT_PRIORITIES.map(({ name }) => name)).toStrictEqual(
      DEFAULT_PRIORITIES.map(({ kind }) => priorities[kind]),
    );
    expect(DEFAULT_CATEGORIES.map(({ name }) => name)).toStrictEqual(
      DEFAULT_CATEGORIES.map(({ kind }) => categories[kind]),
    );
  });
});
