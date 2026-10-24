import { describe, expect, it } from 'vitest';
import { insertMention, mentionParts, mentionQueryAt, mentionsIn } from './mentions.util.ts';

describe('the mention being typed', () => {
  it('starts with an @ at the start of a word, and runs to the caret', () => {
    expect(mentionQueryAt('@', 1)).toStrictEqual({ start: 0, search: '' });
    expect(mentionQueryAt('Thanks @gra', 11)).toStrictEqual({ start: 7, search: 'gra' });
    expect(mentionQueryAt('Thanks\n@Grace Ho', 16)).toStrictEqual({
      start: 7,
      search: 'Grace Ho',
    });
    expect(mentionQueryAt('@gra and more', 4)).toStrictEqual({ start: 0, search: 'gra' });
  });

  it('is no mention in an address, past two words, after a space, or once too long', () => {
    expect(mentionQueryAt('ada@example', 11)).toBeNull();
    expect(mentionQueryAt('@Grace Hopper can', 17)).toBeNull();
    expect(mentionQueryAt('@Grace Hopper ', 14)).toBeNull();
    expect(mentionQueryAt('@ ', 2)).toBeNull();
    expect(mentionQueryAt(`@${'a'.repeat(51)}`, 52)).toBeNull();
  });
});

describe('a picked mention', () => {
  it('replaces what was typed with the name and a space, the caret after them', () => {
    expect(insertMention('Thanks @gra', { start: 7, search: 'gra' }, 'Grace Hopper')).toStrictEqual(
      { text: 'Thanks @Grace Hopper ', caret: 21 },
    );
    expect(insertMention('@gr see', { start: 0, search: 'gr' }, 'Grace Hopper')).toStrictEqual({
      text: '@Grace Hopper see',
      caret: 14,
    });
  });

  it('names the people whose name is still in the text, once each', () => {
    const grace = { id: 'g', name: 'Grace Hopper' };
    const alan = { id: 'a', name: 'Alan Turing' };

    expect(mentionsIn('@Grace Hopper and @Grace Hopper', [grace, alan, grace])).toStrictEqual([
      'g',
    ]);
    expect(mentionsIn('Grace Hopper, no @', [grace])).toStrictEqual([]);
  });
});

describe('the people a comment names, in its text', () => {
  it('are cut out of it, the longest name first', () => {
    expect(
      mentionParts('@Ada Lovelace, ask @Ada about it.', ['Ada', 'Ada Lovelace']),
    ).toStrictEqual([
      { at: 0, text: '@Ada Lovelace', mention: true },
      { at: 13, text: ', ask ', mention: false },
      { at: 19, text: '@Ada', mention: true },
      { at: 23, text: ' about it.', mention: false },
    ]);
  });

  it('leave the text whole without a name it names, or in an address', () => {
    expect(mentionParts('Write to grace@Grace Hopper', ['Grace Hopper'])).toStrictEqual([
      { at: 0, text: 'Write to grace@Grace Hopper', mention: false },
    ]);
    expect(mentionParts('@Alan Turing', [])).toStrictEqual([
      { at: 0, text: '@Alan Turing', mention: false },
    ]);
    expect(mentionParts('', ['Ada'])).toStrictEqual([]);
  });
});
