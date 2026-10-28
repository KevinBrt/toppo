import { ATTACHMENT_NAME_MAX_LENGTH, FILE_NAME_HEADER } from '@toppo-tracker/shared';
import { z } from 'zod';

/** A character takes at most 12 once percent-encoded: 4 bytes of UTF-8, 3 characters each. */
const ENCODED_NAME_MAX_LENGTH = ATTACHMENT_NAME_MAX_LENGTH * 12;

/**
 * The headers of `POST …/attachments`: the file's name, percent-encoded, decoded here; it is
 * cleaned by the command. The other headers pass through untouched.
 */
export const fileUploadHeadersSchema = z.looseObject({
  [FILE_NAME_HEADER]: z
    .string()
    .min(1)
    .max(ENCODED_NAME_MAX_LENGTH)
    .transform((value, context) => {
      try {
        return decodeURIComponent(value);
      } catch {
        context.addIssue({ code: 'custom', message: 'must be percent-encoded UTF-8' });
        return z.NEVER;
      }
    }),
});
