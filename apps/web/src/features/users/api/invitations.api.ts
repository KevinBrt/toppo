import {
  type AcceptInvitationRequest,
  acceptInvitationResponseSchema,
  type CreateInvitationsResponse,
  createInvitationsResponseSchema,
  type InvitationLink,
  type InvitationPreview,
  invitationLinkSchema,
  invitationPreviewResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

const invitationPath = (invitationId: string) =>
  `/api/v1/invitations/${encodeURIComponent(invitationId)}`;

/**
 * Server calls about invitations. Tokens travel in request bodies only, never in a URL the
 * server would log.
 */
export const Invitations = {
  /** One link per new address; the links are shown once and never again. */
  async create(
    emails: string[],
    roleId: string,
    projects: { allProjects: boolean; projectKeys: string[] },
  ): Promise<CreateInvitationsResponse> {
    return await apiRequest('/api/v1/invitations', {
      method: 'POST',
      body: { emails, roleId, ...projects },
      schema: createInvitationsResponseSchema,
    });
  },

  /** A new link for a pending invitation; the previous one stops working. */
  async renew(invitationId: string): Promise<InvitationLink> {
    return await apiRequest(`${invitationPath(invitationId)}/renew`, {
      method: 'POST',
      schema: invitationLinkSchema,
    });
  },

  async revoke(invitationId: string): Promise<void> {
    await apiRequest(invitationPath(invitationId), { method: 'DELETE', schema: z.null() });
  },

  /** Whom a link is for, before choosing a password. */
  async preview(token: string): Promise<InvitationPreview> {
    return await apiRequest('/api/v1/invitations/preview', {
      method: 'POST',
      body: { token },
      schema: invitationPreviewResponseSchema,
    });
  },

  /** Creates the account; returns the address to sign in with. */
  async accept(request: AcceptInvitationRequest): Promise<string> {
    return (
      await apiRequest('/api/v1/invitations/accept', {
        method: 'POST',
        body: request,
        schema: acceptInvitationResponseSchema,
      })
    ).email;
  },
};
