import type { MentionableResponse } from '@toppo/shared';

/** Someone a comment may name. */
export type Mentionable = MentionableResponse['people'][number];

/** An `@` starting a word before the caret, and the name typed after it so far. */
export interface MentionQuery {
  /** Where the `@` is in the text. */
  start: number;
  search: string;
}
