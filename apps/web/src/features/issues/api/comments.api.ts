import {
  addCommentResponseSchema,
  type MentionableResponse,
  mentionableResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const commentsPath = (issueKey: string) =>
  `/api/v1/issues/${encodeURIComponent(issueKey)}/comments`;

/** Server calls about the comments of an issue; they are read in its history. */
export const Comments = {
  /** Comments on an issue, telling the people it names; answers the new comment's id. */
  async add(issueKey: string, body: string, mentions: readonly string[]): Promise<string> {
    return (
      await apiRequest(commentsPath(issueKey), {
        method: 'POST',
        body: { body, mentions },
        schema: addCommentResponseSchema,
      })
    ).id;
  },

  /** Changes the words of one's own comment, telling the people it now names. */
  async edit(
    issueKey: string,
    commentId: string,
    body: string,
    mentions: readonly string[],
  ): Promise<void> {
    await apiRequest(`${commentsPath(issueKey)}/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: { body, mentions },
      schema: noContent,
    });
  },

  /** The first people matching a name whom a comment on the issue may name. */
  async mentionable(issueKey: string, search: string): Promise<MentionableResponse['people']> {
    const query = search ? `?${new URLSearchParams({ search })}` : '';
    return (
      await apiRequest(`/api/v1/issues/${encodeURIComponent(issueKey)}/mentionable${query}`, {
        schema: mentionableResponseSchema,
      })
    ).people;
  },

  /** Deletes a comment for good: one's own, or any for a moderator. */
  async remove(issueKey: string, commentId: string): Promise<void> {
    await apiRequest(`${commentsPath(issueKey)}/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
      schema: noContent,
    });
  },
};
