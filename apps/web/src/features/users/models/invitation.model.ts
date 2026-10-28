import { acceptInvitationRequestSchema } from '@toppo-tracker/shared';
import type { ReactNode } from 'react';
import type { z } from 'zod';

/** Which projects an invitation opens: none until someone adds the person, all, or chosen ones. */
export type InvitationProjectAccess = 'none' | 'all' | 'chosen';

export interface ChosenProject {
  key: string;
  name: string;
}

/**
 * Draws the picker of projects an invitation opens. Projects are another feature: the screen
 * passes the picker in.
 */
export type ProjectPickerSlot = (props: {
  label: string;
  chosen: readonly ChosenProject[];
  onChange: (chosen: ChosenProject[]) => void;
}) => ReactNode;

/** What the invited person types; the token comes from the link. */
export const acceptInvitationFormSchema = acceptInvitationRequestSchema.omit({ token: true });

export type AcceptInvitationFormValues = z.input<typeof acceptInvitationFormSchema>;

export const EMPTY_ACCEPT_INVITATION_FORM: AcceptInvitationFormValues = { name: '', password: '' };
