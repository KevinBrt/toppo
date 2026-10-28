import { z } from 'zod';
import { issueSnapshotSchema } from './events.ts';

/** An issue with its words, as `ctx.issues.get` answers it. */
export const issueDetailsSchema = issueSnapshotSchema.extend({
  /** Markdown. */
  description: z.string(),
});

export type IssueDetails = z.infer<typeof issueDetailsSchema>;

/** As long as a comment of Toppo's may be. */
const COMMENT_BODY_MAX_LENGTH = 20_000;

/**
 * What a plugin may ask Toppo, through `__host.call(method, args)`: the core permission each
 * takes (which the plugin must list in its `needs`; none to read what is its own), its arguments,
 * and Toppo's answer. Toppo checks the arguments again, and the access of whoever it acts for.
 */
export const HOST_CALLS = {
  'issues.get': {
    needs: 'issue.read',
    args: z.object({ issueId: z.uuid() }),
    /** `null` for an issue the plugin, or whoever it acts for, does not see. */
    result: issueDetailsSchema.nullable(),
  },
  'issues.comment': {
    needs: 'comment.create',
    args: z.object({
      issueId: z.uuid(),
      body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
      /** A key that makes the comment single: an event handled twice comments once. */
      once: z.string().min(1).max(200).optional(),
    }),
    result: z.object({ commentId: z.uuid() }),
  },
  'projects.settings': {
    needs: null,
    args: z.object({ projectId: z.uuid() }),
    /**
     * As the project saved them, the plugin's defaults applied by the SDK. Refused (`NOT_FOUND`)
     * for a project the plugin, or whoever it acts for, does not reach.
     */
    result: z.record(z.string(), z.unknown()),
  },
} as const;

export type HostCallMethod = keyof typeof HOST_CALLS;

/** The core permissions a plugin may need: those its calls take. */
export const PLUGIN_NEEDS = ['issue.read', 'comment.create'] as const;

export type PluginNeed = (typeof PLUGIN_NEEDS)[number];
