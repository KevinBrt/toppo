import { z } from 'zod';
import { PLUGIN_NEEDS } from './calls.ts';
import { checkEntities, entitiesSchema } from './declarations/entities.ts';
import { checkHttp, httpDeclarationSchema } from './declarations/http.ts';
import { jobsSchema } from './declarations/jobs.ts';
import { checkProperties, propertiesSchema } from './declarations/properties.ts';
import { routesSchema } from './declarations/routes.ts';
import { checkScreens, dialogsSchema, pagesSchema, panelsSchema } from './declarations/screens.ts';
import { checkSettings, NO_SETTINGS_SCHEMA, settingsSchema } from './declarations/settings.ts';
import { EVENT_TYPES } from './events.ts';
import { PLUGIN_LOGO_FILES } from './package.ts';
import { apiVersionSchema } from './version.ts';

/** `time-tracking`: lowercase words joined by dashes, as its URLs and its permissions use it. */
export const PLUGIN_ID = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** `1.2.0`, `1.2.0-beta.1`: Toppo shows it, and compares it when the plugin is upgraded. */
export const PLUGIN_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z.-]{1,40})?$/;

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
 * Refuses an action on an issue from a plugin that does not read issues: whoever runs it sees
 * only what the plugin sees, so Toppo would answer 404 for every issue.
 */
function checkIssueActions(
  manifest: {
    needs: readonly string[];
    actions: readonly { name: string; access: z.output<typeof accessSchema> }[];
  },
  ctx: z.RefinementCtx,
): void {
  if (manifest.needs.includes('issue.read')) {
    return;
  }
  manifest.actions.forEach(({ name, access }, index) => {
    if (access !== 'authenticated' && 'issue' in access) {
      ctx.addIssue({
        code: 'custom',
        path: ['actions', index, 'access'],
        message: `${name} acts on an issue: the plugin needs issue.read`,
      });
    }
  });
}

/**
 * What a plugin declares, as its bundle answers `manifest()` in the sandbox: Toppo never reads it
 * from a file its author writes. Unknown keys are refused, as is anything past its limits.
 */
export const manifestSchema = z
  .strictObject({
    id: z.string().regex(PLUGIN_ID, 'A plugin id is lowercase words joined by dashes'),
    /** What it is called and what it does, as keys of its messages, shown in each language. */
    name: z.string().max(200),
    description: z.string().max(200),
    /** Its logo, a file at the root of its package, if it has one. */
    logo: z.enum(PLUGIN_LOGO_FILES).optional(),
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
    settings: settingsSchema,
    /** What each project it acts in sets for itself; none for a plugin uploaded before them. */
    projectSettings: settingsSchema.default(NO_SETTINGS_SCHEMA),
    /** What it keeps, by name; none for a plugin uploaded before entities. */
    entities: entitiesSchema.default({}),
    /** What it adds to issues, by name; none for a plugin uploaded before properties. */
    properties: propertiesSchema.default({}),
    messages: z.strictObject({ en: messagesSchema, fr: messagesSchema }),
    actions: z
      .array(z.strictObject({ name: nameSchema, access: accessSchema, input: jsonSchema }))
      .max(PLUGIN_LIMITS.actions),
    /** Its pages and panels, drawn in frames of their own; none for a plugin before screens. */
    pages: pagesSchema.default([]),
    panels: panelsSchema.default([]),
    /** Its dialogs, opened over the page by its screens; none for a plugin before them. */
    dialogs: dialogsSchema.default([]),
    events: z.array(z.enum(EVENT_TYPES)).max(EVENT_TYPES.length),
    /** What it does on its own, again and again; none for a plugin uploaded before jobs. */
    jobs: jobsSchema.default([]),
    /** What it may reach outside Toppo; nothing for a plugin uploaded before. */
    http: httpDeclarationSchema.nullable().default(null),
    /** Where services outside Toppo call it; none for a plugin uploaded before routes. */
    routes: routesSchema.default([]),
  })
  .superRefine(checkIssueActions)
  .superRefine(checkSettings)
  .superRefine(checkEntities)
  .superRefine(checkProperties)
  .superRefine(checkScreens)
  .superRefine(checkHttp);

export type Manifest = z.infer<typeof manifestSchema>;
