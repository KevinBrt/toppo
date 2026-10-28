import { emailSchema } from '@toppo-tracker/shared';

/**
 * The addresses typed in the invitation box: one per line, or separated by commas, semicolons
 * or spaces. Valid ones come back normalized and without duplicates, the others as typed.
 */
export function parseEmails(text: string): { emails: string[]; invalid: string[] } {
  const emails = new Set<string>();
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const parsed = emailSchema.safeParse(part);
    if (parsed.success) {
      emails.add(parsed.data);
    } else {
      invalid.push(part);
    }
  }
  return { emails: [...emails], invalid };
}
