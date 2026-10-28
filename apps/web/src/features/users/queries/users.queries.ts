import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { MembersQuery } from '@toppo-tracker/shared';
import { Invitations } from '../api/invitations.api.ts';
import { Users } from '../api/users.api.ts';

/** Cached member management data. Keys start with `users`. */
export const UsersQueries = {
  /** Every cached page of the members list, to refresh them all after a change. */
  allMembers: ['users', 'members'] as const,
  /** One page, as the server filtered it. The previous page stays shown while the next loads. */
  members: (query: MembersQuery) =>
    queryOptions({
      queryKey: ['users', 'members', query],
      queryFn: () => Users.members(query),
      placeholderData: keepPreviousData,
    }),
  /** A member's access to the projects matching `search`. */
  projects: (userId: string, search: string) =>
    queryOptions({
      queryKey: ['users', 'projects', userId, search],
      queryFn: () => Users.projects(userId, search),
      placeholderData: keepPreviousData,
    }),
  /** Every cached search of a member's projects, to refresh them after a change. */
  allProjectsOf: (userId: string) => ['users', 'projects', userId] as const,
  /** A short configuration list: loaded whole. */
  assignableRoles: queryOptions({
    queryKey: ['users', 'assignable-roles'],
    queryFn: () => Users.assignableRoles(),
  }),
  /** A link's invitation, as its holder sees it. An answer, even a refusal, does not change. */
  invitationPreview: (token: string) =>
    queryOptions({
      queryKey: ['users', 'invitation-preview', token],
      queryFn: () => Invitations.preview(token),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    }),
};
