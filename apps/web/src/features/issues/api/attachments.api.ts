import {
  type AttachmentLimitsResponse,
  addAttachmentResponseSchema,
  attachmentLimitsResponseSchema,
  FILE_NAME_HEADER,
  type IssueAttachmentsResponse,
  issueAttachmentsResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiBytes, apiRequest } from '../../../shared/api/http.client.ts';
import { decodeText } from '../utils/text-decoding.util.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const issuePath = (issueKey: string) => `/api/v1/issues/${encodeURIComponent(issueKey)}`;
const filePath = (issueKey: string, attachmentId: string) =>
  `${issuePath(issueKey)}/attachments/${encodeURIComponent(attachmentId)}`;

/** A file to send, told apart from others of the same name. */
export interface FileToSend {
  id: string;
  file: File;
}

/** A file that could not be attached, and why. */
export interface FailedUpload extends FileToSend {
  error: unknown;
}

/** Server calls about the files of an issue: of its request, or of one of its comments. */
export const Attachments = {
  /** The files of an issue's request, oldest first. */
  async list(issueKey: string): Promise<IssueAttachmentsResponse> {
    return await apiRequest(`${issuePath(issueKey)}/attachments`, {
      schema: issueAttachmentsResponseSchema,
    });
  },

  /** The largest file the server accepts. */
  async limits(): Promise<AttachmentLimitsResponse> {
    return await apiRequest('/api/v1/attachments/limits', {
      schema: attachmentLimitsResponseSchema,
    });
  },

  /** Sends one file, to the issue's request or to a comment; answers its id. */
  async add(issueKey: string, file: File, commentId?: string): Promise<string> {
    const place = commentId === undefined ? '' : `/comments/${encodeURIComponent(commentId)}`;
    return (
      await apiRequest(`${issuePath(issueKey)}${place}/attachments`, {
        method: 'POST',
        body: file,
        headers: { [FILE_NAME_HEADER]: encodeURIComponent(file.name) },
        schema: addAttachmentResponseSchema,
      })
    ).id;
  },

  /**
   * Sends files one after the other, in their order, telling each one sent; answers those that
   * could not be attached, the others staying attached.
   */
  async addAll(
    issueKey: string,
    files: readonly FileToSend[],
    { commentId, onSent }: { commentId?: string; onSent?: (sent: number) => void } = {},
  ): Promise<FailedUpload[]> {
    const failed: FailedUpload[] = [];
    for (const [index, { id, file }] of files.entries()) {
      try {
        await Attachments.add(issueKey, file, commentId);
      } catch (error) {
        failed.push({ id, file, error });
      }
      onSent?.(index + 1);
    }
    return failed;
  },

  /** Removes a file for good. */
  async remove(issueKey: string, attachmentId: string): Promise<void> {
    await apiRequest(filePath(issueKey, attachmentId), { method: 'DELETE', schema: noContent });
  },

  /** The words of a text file, to show them in the app. */
  async text(issueKey: string, attachmentId: string): Promise<string> {
    return decodeText(await apiBytes(Attachments.downloadUrl(issueKey, attachmentId)));
  },

  /** Where the browser downloads a file: always as an attachment. */
  downloadUrl: (issueKey: string, attachmentId: string) =>
    `${filePath(issueKey, attachmentId)}/download`,

  /** Where the browser shows an image or a PDF by itself; an image's thumbnail too. */
  previewUrl: (issueKey: string, attachmentId: string) =>
    `${filePath(issueKey, attachmentId)}/preview`,
};
