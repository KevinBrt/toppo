import { z } from 'zod';
import { PLUGIN_NEEDS } from './calls.ts';
import { checkEntities, entitiesSchema } from './declarations/entities.ts';
import { checkHttp, httpDeclarationSchema } from './declarations/http.ts';
import { jobsSchema } from './declarations/jobs.ts';
import { checkProperties, propertiesSchema } from './declarations/properties.ts';
import { routesSchema } from './declarations/routes.ts';
import {
  checkScreens,
  type DialogDeclaration,
  dialogsSchema,
  type PageDeclaration,
  pagesSchema,
  panelsSchema,
  type ScreenAccess,
} from './declarations/screens.ts';
import { checkSettings, NO_SETTINGS_SCHEMA, settingsSchema } from './declarations/settings.ts';
import { EVENT_TYPES } from './events.ts';
import { PLUGIN_LOGO_FILES } from './package.ts';
import { apiVersionSchema, asksAtLeast } from './version.ts';

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
 * The plugin API from which an access where no project is names a permission of the instance:
 * one of projects is held in projects only, so Toppo refused it to everyone there.
 */
export const INSTANCE_ACCESS_API = '1.1';

/**
 * Refuses, from API 1.1, a permission of projects where no project is: an action on no issue, a
 * page of the main sidebar or of the settings, a dialog. There, only one of the plugin's own
 * permissions of the instance is held.
 */
function checkAccessScopes(
  manifest: {
    apiVersion: string;
    permissions: Readonly<Record<string, { scope: 'instance' | 'project' }>>;
    actions: readonly { name: string; access: z.output<typeof accessSchema> }[];
    pages: readonly PageDeclaration[];
    dialogs: readonly DialogDeclaration[];
  },
  ctx: z.RefinementCtx,
): void {
  if (!asksAtLeast(manifest.apiVersion, INSTANCE_ACCESS_API)) {
    return;
  }
  const projectless: {
    path: (string | number)[];
    name: string;
    access: z.output<typeof accessSchema> | ScreenAccess;
  }[] = [
    ...manifest.actions.map(({ name, access }, at) => ({ path: ['actions', at], name, access })),
    ...manifest.pages.flatMap(({ name, zone, access }, at) =>
      zone === 'project.settings' ? [] : [{ path: ['pages', at], name, access }],
    ),
    ...manifest.dialogs.map(({ name, access }, at) => ({ path: ['dialogs', at], name, access })),
  ];
  for (const { path, name, access } of projectless) {
    if (access === 'authenticated' || 'issue' in access) {
      continue;
    }
    const { permission } = access;
    const declared = Object.hasOwn(manifest.permissions, permission)
      ? manifest.permissions[permission]
      : undefined;
    if (declared?.scope !== 'instance') {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'access'],
        message: `${name} is reached in no project: ${permission} must be one of the plugin's permissions of the instance`,
      });
    }
  }
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
  .superRefine(checkAccessScopes)
  .superRefine(checkSettings)
  .superRefine(checkEntities)
  .superRefine(checkProperties)
  .superRefine(checkScreens)
  .superRefine(checkHttp);

export type Manifest = z.infer<typeof manifestSchema>;
