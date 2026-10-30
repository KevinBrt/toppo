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

/**
 * What Toppo opens for a screen, over the page, may hold: a dialog's input and what it closes
 * with, as JSON, and a menu's items.
 */
export const OVERLAY_LIMITS = {
  dialogInputBytes: 4 * 1024,
  dialogResultBytes: 16 * 1024,
  menuItems: 20,
} as const;

/** JSON of at most `bytes` characters. */
const jsonWithin = (bytes: number) =>
  z.json().refine((value) => JSON.stringify(value).length <= bytes, {
    message: `At most ${bytes} characters of JSON`,
  });

/** Where in the frame something is, in its pixels: what a menu opens beside. */
const rectSchema = z.strictObject({
  x: z.number().min(-100_000).max(100_000),
  y: z.number().min(-100_000).max(100_000),
  width: z.number().min(0).max(100_000),
  height: z.number().min(0).max(100_000),
});

/** One choice of a menu Toppo draws for a screen. */
export const menuItemSchema = z.strictObject({
  /** What the screen is answered when it is chosen. */
  id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  label: z.string().min(1).max(100),
  tone: z.enum(['default', 'danger']).default('default'),
  disabled: z.boolean().default(false),
});

export type MenuItem = z.input<typeof menuItemSchema>;

/** An issue picked in Toppo's search, as the screen that asked is answered. */
export const pickedIssueSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  projectId: z.uuid(),
  projectKey: z.string(),
});

export type PickedIssue = z.infer<typeof pickedIssueSchema>;

/** Someone picked in Toppo's search. */
export const pickedPersonSchema = z.object({ id: z.uuid(), name: z.string() });

export type PickedPerson = z.infer<typeof pickedPersonSchema>;

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
  /** Asks the person to confirm, in a dialog of Toppo's: answered `true` or `false`. */
  z.strictObject({
    kind: z.literal('confirm'),
    id: callId,
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    confirmLabel: z.string().min(1).max(60).optional(),
    tone: z.enum(['default', 'danger']).default('default'),
  }),
  /** Opens one of the plugin's dialogs: answered what it closed with, `null` when dismissed. */
  z.strictObject({
    kind: z.literal('dialog'),
    id: callId,
    name: z.string().regex(SCREEN_NAME),
    input: jsonWithin(OVERLAY_LIMITS.dialogInputBytes),
  }),
  /** From a dialog: closes it, with what the screen that opened it is answered. */
  z.strictObject({
    kind: z.literal('close'),
    result: jsonWithin(OVERLAY_LIMITS.dialogResultBytes).optional(),
  }),
  /** A menu Toppo draws over the page beside `anchor`: answered the item chosen, or `null`. */
  z.strictObject({
    kind: z.literal('menu'),
    id: callId,
    anchor: rectSchema,
    items: z.array(menuItemSchema).min(1).max(OVERLAY_LIMITS.menuItems),
  }),
  /**
   * Toppo's search of issues, or of people, in the projects where the plugin acts that the person
   * sees: answered the issue picked (`null` for none), or the people (none, one, or several).
   */
  z.strictObject({
    kind: z.literal('pick'),
    id: callId,
    of: z.enum(['issue', 'people']),
    multiple: z.boolean().default(false),
    projectId: z.uuid().optional(),
  }),
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
    /** What the screen that opened a dialog handed it; `null` for any other screen. */
    input: z.json().nullable().default(null),
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
