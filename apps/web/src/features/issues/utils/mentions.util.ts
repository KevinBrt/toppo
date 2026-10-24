import type { Mentionable, MentionQuery } from '../models/mention.model.ts';

/**
 * An `@` at the start of a word, then at most two words up to the caret: `@Grace Hopper` is
 * still a name being typed, a third word is a sentence again. An address (`ada@example.com`) is
 * no mention.
 */
const TYPED_MENTION = /(?:^|\s)@((?:[^\s@]+(?: [^\s@]*)?)?)$/u;

/** A name is never longer than this: past it, the text is no mention any more. */
const SEARCH_MAX_LENGTH = 50;

/** The mention being typed just before `caret`, if any. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const search = TYPED_MENTION.exec(text.slice(0, caret))?.[1];
  if (search === undefined || search.length > SEARCH_MAX_LENGTH) {
    return null;
  }
  return { start: caret - search.length - 1, search };
}

/** `text` with the mention being typed replaced by `@name` and a space, and the caret after it. */
export function insertMention(
  text: string,
  query: MentionQuery,
  name: string,
): { text: string; caret: number } {
  const before = text.slice(0, query.start);
  const after = text.slice(query.start + 1 + query.search.length).replace(/^ /u, '');
  const mention = `@${name} `;
  return { text: `${before}${mention}${after}`, caret: before.length + mention.length };
}

/** A piece of a comment's text: as written, or the `@name` of someone it names. */
export interface TextPart {
  /** Where it starts in the text. */
  at: number;
  text: string;
  mention: boolean;
}

/**
 * `text` cut where it names people, `@` and one of `names` at the start of a word: the longest
 * name first, so that `@Ada Lovelace` is never read as `@Ada`.
 */
export function mentionParts(text: string, names: readonly string[]): TextPart[] {
  const longestFirst = [...new Set(names)].filter(Boolean).toSorted((a, b) => b.length - a.length);
  const parts: TextPart[] = [];
  let plainFrom = 0;
  let index = text.indexOf('@');
  while (index !== -1) {
    const startsWord = index === 0 || /\s/u.test(text.charAt(index - 1));
    const name = startsWord
      ? longestFirst.find((candidate) => text.startsWith(candidate, index + 1))
      : undefined;
    if (name === undefined) {
      index = text.indexOf('@', index + 1);
      continue;
    }
    if (index > plainFrom) {
      parts.push({ at: plainFrom, text: text.slice(plainFrom, index), mention: false });
    }
    parts.push({ at: index, text: `@${name}`, mention: true });
    plainFrom = index + name.length + 1;
    index = text.indexOf('@', plainFrom);
  }
  if (plainFrom < text.length) {
    parts.push({ at: plainFrom, text: text.slice(plainFrom), mention: false });
  }
  return parts;
}

/** The people picked whose `@name` is still in the text, by id, once each. */
export function mentionsIn(
  text: string,
  picked: readonly Pick<Mentionable, 'id' | 'name'>[],
): string[] {
  const named = picked.filter(({ name }) => text.includes(`@${name}`));
  return [...new Set(named.map(({ id }) => id))];
}
