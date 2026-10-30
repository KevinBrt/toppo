import { EVENT_TYPES } from '@toppo-tracker/plugin-sdk/protocol';
import { webhookRequestSchema } from '@toppo-tracker/shared';
import { z } from 'zod';

/**
 * A webhook as an administrator sets it, its events among those plugins hear of (one format for
 * both), each once. An address in clear http only reaches inside the network, as allowed.
 */
export const webhookInputSchema = webhookRequestSchema
  .extend({ events: z.array(z.enum(EVENT_TYPES)).min(1).max(EVENT_TYPES.length) })
  .transform((input) => ({ ...input, events: [...new Set(input.events)] }))
  .refine(({ url, allowPrivate }) => allowPrivate || url.startsWith('https://'), {
    path: ['url'],
    message: 'An address in https, unless it lies inside the network',
  });
