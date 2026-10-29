import type { z } from 'zod';

/**
 * A setting kept secret, such as the address of a chat's webhook, which lets anyone who has it
 * post: Toppo seals it once typed, never shows it again, and gives it to the plugin only. A
 * secret is the instance's, without a default: `secret(z.url()).optional()`.
 */
export function secret<T extends z.ZodType<string>>(schema: T): T {
  return schema.meta({ writeOnly: true });
}
