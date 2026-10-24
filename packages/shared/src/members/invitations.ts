import { z } from 'zod';
import { displayNameSchema, emailSchema, passwordSchema } from '../auth.ts';
import { projectKeySchema } from '../project-key.ts';
import { roleBadgeSchema } from './roles.ts';

/** How many addresses one invitation request may carry. */
export const INVITATIONS_PER_REQUEST_MAX = 20;

/** 32 random bytes, base64url-encoded: what an invitation link carries after `#`. */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const invitationIdParamsSchema = z.object({
  invitationId: z.uuid(),
});

/** How many projects one invitation gives access to, one by one. */
export const INVITATION_PROJECTS_MAX = 50;

/** Body of `POST /api/v1/invitations`. */
export const createInvitationsRequestSchema = z.object({
  emails: z.array(emailSchema).min(1).max(INVITATIONS_PER_REQUEST_MAX),
  roleId: z.uuid(),
  /** Access to every project, present and future. */
  allProjects: z.boolean().default(false),
  /** Otherwise, the projects to join; none by default. */
  projectKeys: z.array(projectKeySchema).max(INVITATION_PROJECTS_MAX).default([]),
});

export type CreateInvitationsRequest = z.input<typeof createInvitationsRequestSchema>;

/** An invitation link, shown once: only a hash of its token is kept. */
export const invitationLinkSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  link: z.url(),
  /** Sent by email too, email being set up: otherwise the link is passed on by hand. */
  emailed: z.boolean(),
});

export type InvitationLink = z.infer<typeof invitationLinkSchema>;

/** Body of the answer to `POST /api/v1/invitations`. */
export const createInvitationsResponseSchema = z.object({
  invitations: z.array(invitationLinkSchema),
  /** Addresses left out because they already belong to a member. */
  alreadyMembers: z.array(z.string()),
});

export type CreateInvitationsResponse = z.infer<typeof createInvitationsResponseSchema>;

export const pendingInvitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  /** The role the new member will get. */
  role: roleBadgeSchema,
  /** Name of who sent it; `null` once their account was deleted. */
  invitedBy: z.string().nullable(),
  /** UTC ISO 8601; once past, only a renewed link works. */
  expiresAt: z.iso.datetime(),
});

export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;

/** Body of `POST /api/v1/invitations/preview`: the token travels in the body, never in a URL. */
export const invitationPreviewRequestSchema = z.object({
  token: invitationTokenSchema,
});

export const invitationPreviewResponseSchema = z.object({
  email: z.string(),
  /** Name of who sent it; `null` once their account was deleted. */
  invitedBy: z.string().nullable(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewResponseSchema>;

/** Body of `POST /api/v1/invitations/accept`. */
export const acceptInvitationRequestSchema = z.object({
  token: invitationTokenSchema,
  name: displayNameSchema,
  password: passwordSchema,
});

export type AcceptInvitationRequest = z.input<typeof acceptInvitationRequestSchema>;

export const acceptInvitationResponseSchema = z.object({
  /** The address to sign in with. */
  email: z.string(),
});
