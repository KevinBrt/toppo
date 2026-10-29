import { z } from 'zod';
import { SCREEN_NAME } from './declarations/screens.ts';
import { LOCALES, messageParamsSchema } from './run.ts';

/**
 * The bridge between a plugin's screen and Toppo: a frame without an origin, which reaches
 * nothing but through these messages, posted to the page that holds it. Toppo checks each one
 * as it comes, from that frame only, then acts for the person looking at it, within what the
 * plugin and they may do; the frame never sees the person's session.
 */

const callId = z.int().min(0).max(Number.MAX_SAFE_INTEGER);

/** `timeEntry.log`: one of the plugin's actions. Mirrors the manifest's names. */
const actionName = z
  .string()
  .max(60)
  .regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/);

/** A page's search, kept in Toppo's address: a few short words, by name. */
export const screenSearchSchema = z
  .record(z.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/), z.string().max(200))
  .refine((search) => Object.keys(search).length <= 20, { message: 'At most 20 search terms' });

export type ScreenSearch = z.infer<typeof screenSearchSchema>;

/** Where a screen may send the person: one of Toppo's issues, or another of the plugin's pages. */
const targetSchema = z.discriminatedUnion('to', [
  z.strictObject({ to: z.literal('issue'), key: z.string().max(30) }),
  z.strictObject({
    to: z.literal('page'),
    name: z.string().regex(SCREEN_NAME),
    search: screenSearchSchema.optional(),
  }),
]);

export type ScreenTarget = z.infer<typeof targetSchema>;

/** What a screen asks Toppo. */
export const frameMessageSchema = z.discriminatedUnion('kind', [
  /** Loaded: Toppo answers with its context. */
  z.strictObject({ kind: z.literal('ready') }),
  /** The height of its content, for Toppo to size the frame to it. */
  z.strictObject({ kind: z.literal('resize'), height: z.number().min(0).max(100_000) }),
  /**
   * Runs one of the plugin's actions, for the person looking at it; `changes` when it is run to
   * change something, for Toppo to show what changed around the screen.
   */
  z.strictObject({
    kind: z.literal('action'),
    id: callId,
    name: actionName,
    input: z.unknown(),
    changes: z.boolean().default(false),
  }),
  /** The names of people, those the person looking at it may see. */
  z.strictObject({ kind: z.literal('people'), id: callId, ids: z.array(z.uuid()).max(100) }),
  /** A page's new search, kept in the address. */
  z.strictObject({ kind: z.literal('search'), search: screenSearchSchema }),
  /** Somewhere to go, in Toppo. */
  z.strictObject({ kind: z.literal('open'), target: targetSchema }),
]);

export type FrameMessage = z.infer<typeof frameMessageSchema>;

/** What the screen shows: an issue for a panel, a project for a project's settings. */
const shownSchema = z.object({
  issue: z
    .object({ id: z.uuid(), key: z.string(), projectId: z.uuid(), projectKey: z.string() })
    .nullable(),
  project: z.object({ id: z.uuid(), key: z.string(), name: z.string() }).nullable(),
});

/** Why something a screen asked failed: the plugin's own message key, or one of Toppo's codes. */
export const screenFailureSchema = z.object({
  code: z.string(),
  params: messageParamsSchema.optional(),
  /** What did not fit an action's input, field by field. */
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ScreenFailure = z.infer<typeof screenFailureSchema>;

/** What Toppo tells a screen. */
export const hostMessageSchema = z.union([
  /** Where it is and for whom, again whenever that changes. */
  z.object({
    kind: z.literal('context'),
    locale: z.enum(LOCALES),
    user: z.object({ id: z.uuid(), name: z.string() }),
    screen: z.string().regex(SCREEN_NAME),
    search: screenSearchSchema,
    ...shownSchema.shape,
  }),
  z.object({ kind: z.literal('answer'), id: callId, ok: z.literal(true), result: z.unknown() }),
  z.object({
    kind: z.literal('answer'),
    id: callId,
    ok: z.literal(false),
    error: screenFailureSchema,
  }),
  z.object({
    kind: z.literal('people'),
    id: callId,
    people: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })),
  }),
]);

export type HostMessage = z.infer<typeof hostMessageSchema>;

export type ScreenContext = Extract<HostMessage, { kind: 'context' }>;

/**
 * The global Toppo's runtime defines in a screen's frame, before the plugin's `web.js`: the plugin
 * registers its screens with it.
 */
export const SCREEN_RUNTIME_GLOBAL = '__toppoScreens';
