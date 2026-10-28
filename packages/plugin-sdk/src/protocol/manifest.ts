import { z } from 'zod';
import { PLUGIN_NEEDS } from './calls.ts';
import { EVENT_TYPES } from './events.ts';
import { apiVersionSchema } from './version.ts';

/** `time-tracking`: lowercase words joined by dashes, as its URLs and its permissions use it. */
export const PLUGIN_ID = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** `timeEntry.log`, `reports.read`: a resource, a dot, an action. */
const NAME = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

const nameSchema = z.string().max(60).regex(NAME, 'A name is written like resource.action');

/** What a plugin may declare, at most. */
export const PLUGIN_LIMITS = {
  permissions: 30,
  actions: 100,
  messageLength: 1000,
} as const;

export type Messages = { readonly [key: string]: string | Messages };

/** A plugin's words in one language: strings, grouped in objects. */
export const messagesSchema: z.ZodType<Messages> = z.lazy(() =>
  z.record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
    z.union([z.string().max(PLUGIN_LIMITS.messageLength), messagesSchema]),
  ),
);

/** A schema as JSON Schema: Toppo checks with it what reaches the plugin. */
const jsonSchema = z.record(z.string(), z.unknown());

/**
 * Who may run an action: anyone signed in, those who hold a permission, or those who see the
 * issue its input names (Toppo answers 404 to the others), with a permission or not.
 */
export const accessSchema = z.union([
  z.literal('authenticated'),
  z.strictObject({ permission: z.string().max(100) }),
  z.strictObject({ issue: z.string().max(100), permission: z.string().max(100).optional() }),
]);

/**
 * What a plugin declares, as its bundle answers `manifest()` in the sandbox: Toppo never reads it
 * from a file its author writes. Unknown keys are refused, as is anything past its limits.
 */
export const manifestSchema = z.strictObject({
  id: z.string().regex(PLUGIN_ID, 'A plugin id is lowercase words joined by dashes'),
  apiVersion: apiVersionSchema,
  needs: z.array(z.enum(PLUGIN_NEEDS)).max(PLUGIN_NEEDS.length),
  permissions: z
    .record(
      nameSchema,
      z.strictObject({ scope: z.enum(['instance', 'project']), label: z.string().max(200) }),
    )
    .refine((permissions) => Object.keys(permissions).length <= PLUGIN_LIMITS.permissions, {
      message: `At most ${PLUGIN_LIMITS.permissions} permissions`,
    }),
  settings: jsonSchema,
  messages: z.strictObject({ en: messagesSchema, fr: messagesSchema }),
  actions: z
    .array(z.strictObject({ name: nameSchema, access: accessSchema, input: jsonSchema }))
    .max(PLUGIN_LIMITS.actions),
  events: z.array(z.enum(EVENT_TYPES)).max(EVENT_TYPES.length),
});

export type Manifest = z.infer<typeof manifestSchema>;
