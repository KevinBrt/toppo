import { PROJECT_KEY_PATTERN } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import { suggestProjectKey } from './project-key.util.ts';

describe('suggestProjectKey', () => {
  it.each([
    ['Portail clients', 'PC'],
    ['Website', 'WEB'],
    ['API', 'API'],
    ['Équipe réseau & sécurité', 'ERS'],
    ['  mobile   app ', 'MA'],
    ['Q4 2026 roadmap', 'Q2R'],
  ])('suggests %j for %j', (name, key) => {
    expect(suggestProjectKey(name)).toBe(key);
  });

  it('suggests nothing when the name gives too little', () => {
    expect(suggestProjectKey('')).toBe('');
    expect(suggestProjectKey('X')).toBe('');
    expect(suggestProjectKey('!!!')).toBe('');
    // A key starts with a letter: the digits in front go, and one letter is not enough.
    expect(suggestProjectKey('2026 plan')).toBe('');
  });

  it('keeps to ten characters, and only suggests valid keys', () => {
    const name = 'a b c d e f g h i j k l';

    expect(suggestProjectKey(name)).toBe('ABCDEFGHIJ');
    for (const sample of ['Portail clients', 'Website', name, 'Q4 2026 roadmap']) {
      expect(suggestProjectKey(sample)).toMatch(PROJECT_KEY_PATTERN);
    }
  });
});
