import { categoriesRequestSchema } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import type { OptionDraft } from '../models/option-draft.model.ts';
import { nameProblemsOf, newOptionKey, nextColor } from './option-drafts.util.ts';

const draft = (key: string, name: string, color: OptionDraft['color'] = 'gray'): OptionDraft => ({
  key,
  name,
  color,
  issueCount: 0,
});

describe('newOptionKey', () => {
  it('never gives the same key twice', () => {
    expect(newOptionKey()).not.toBe(newOptionKey());
  });
});

describe('nextColor', () => {
  it('takes the first color no option has', () => {
    expect(nextColor([draft('a', 'Bug', 'gray'), draft('b', 'Request', 'blue')])).toBe('green');
  });

  it('rounds again once every color is taken', () => {
    const all = ['gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink'] as const;
    expect(nextColor(all.map((color, index) => draft(String(index), color, color)))).toBe('gray');
  });
});

describe('nameProblemsOf', () => {
  it('finds a blank name, a long one and a name taken, by option', () => {
    const drafts = [
      draft('a', ' '),
      draft('b', 'x'.repeat(41)),
      draft('c', 'Bug'),
      draft('d', 'bug'),
    ];
    const result = categoriesRequestSchema.safeParse({
      categories: drafts.map(({ name, color }, index) => ({ name, color, isDefault: index === 2 })),
    });

    expect(result.success).toBe(false);
    expect(Object.fromEntries(nameProblemsOf(result.error?.issues ?? [], drafts))).toStrictEqual({
      a: 'blank',
      b: 'tooLong',
      d: 'duplicate',
    });
  });
});
