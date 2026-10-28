import type { AttachmentLimitsResponse } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

/** What forms check before sending a file: the largest one this instance accepts. */
export const getAttachmentLimits = defineQuery({
  name: 'attachment.limits',
  access: 'authenticated',
  input: z.object({}),
  handler: ({ services }): Promise<AttachmentLimitsResponse> =>
    Promise.resolve({ maxFileSize: services.files.maxFileSize }),
});
