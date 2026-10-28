import { invitationTokenSchema } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  hashInvitationToken,
  invitationLink,
  newInvitationToken,
} from './invitation-token.util.ts';

describe('invitation tokens', () => {
  it('are random and in the format links carry', () => {
    const tokens = Array.from({ length: 50 }, newInvitationToken);

    expect(new Set(tokens).size).toBe(50);
    for (const token of tokens) {
      expect(invitationTokenSchema.safeParse(token).success, token).toBe(true);
    }
  });

  it('are stored as a SHA-256 hash, never as themselves', () => {
    const token = newInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(hash);
  });

  it('travel after the # of a link to the instance', () => {
    expect(invitationLink(new URL('https://toppo.example.com'), 'abc')).toBe(
      'https://toppo.example.com/invitation#abc',
    );
  });
});
