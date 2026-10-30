import { z } from 'zod';

/** Words in each language Toppo speaks: a plugin's, from its own messages. */
const translatedSchema = z.object({ en: z.string(), fr: z.string() });

/** `report`: a screen's name, the last part of its address. Mirrors SCREEN_NAME (`…/protocol`). */
export const screenNameSchema = z.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/);

/** `time-tracking`. Mirrors PLUGIN_ID (`@toppo-tracker/plugin-sdk/protocol`). */
const pluginSlugPattern = z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/);

/**
 * A plugin's screen someone may open: its plugin, its name and title, and where it shows. A page
 * with an entry has its label and icon (from Toppo's set, by name).
 */
export const pluginScreenSchema = z.object({
  pluginSlug: z.string(),
  plugin: translatedSchema,
  name: z.string(),
  title: translatedSchema,
  entry: z.object({ label: translatedSchema, icon: z.string() }).nullable(),
});

export type PluginScreen = z.infer<typeof pluginScreenSchema>;

/**
 * Body of `GET /api/v1/plugins/screens`: the pages of enabled plugins the signed-in person may
 * open, in the main sidebar and in the settings, each plugin's in the order it declares them.
 */
export const pluginScreensResponseSchema = z.object({
  main: z.array(pluginScreenSchema),
  settings: z.array(pluginScreenSchema),
});

export type PluginScreensResponse = z.infer<typeof pluginScreensResponseSchema>;

/**
 * Body of `GET /api/v1/projects/:projectKey/plugin-screens`: the tabs of a project's settings of
 * the plugins at work in it that the person may open.
 */
export const pluginPlacedScreensResponseSchema = z.object({
  screens: z.array(pluginScreenSchema),
});

export type PluginPlacedScreensResponse = z.infer<typeof pluginPlacedScreensResponseSchema>;

/**
 * Body of `GET /api/v1/issues/:issueKey/plugin-panels`: the issue, as the panels are told of it,
 * and the panels of the plugins at work in its project that the person may open.
 */
export const issuePanelsResponseSchema = pluginPlacedScreensResponseSchema.extend({
  issue: z.object({
    id: z.uuid(),
    key: z.string(),
    projectId: z.uuid(),
    projectKey: z.string(),
  }),
});

export type IssuePanelsResponse = z.infer<typeof issuePanelsResponseSchema>;

/**
 * Query of a screen's frame, `/plugin-screens/:pluginSlug/:screen`: the project whose settings it
 * is a tab of, or the issue it shows beside.
 */
export const screenFrameQuerySchema = z.object({
  project: z.string().max(10).optional(),
  issue: z.string().max(30).optional(),
});

export const screenFrameParamsSchema = z.object({
  pluginSlug: pluginSlugPattern,
  screen: screenNameSchema,
});

/** Query of `GET /api/v1/people`: the people whose names a screen shows. */
export const peopleQuerySchema = z.object({
  ids: z
    .string()
    .max(100 * 37)
    .transform((ids) => (ids === '' ? [] : ids.split(',')))
    .pipe(z.array(z.uuid()).max(100)),
});

/**
 * Body of `GET /api/v1/people`: the names of those asked for that the person asking may see,
 * sharing a project with them; the others are left out.
 */
export const peopleResponseSchema = z.object({
  people: z.array(z.object({ id: z.uuid(), name: z.string() })).max(100),
});

export type PeopleResponse = z.infer<typeof peopleResponseSchema>;

/** A plugin's dialog, as Toppo opens it over the page: its title, its width, and where. */
export const pluginDialogSchema = z.object({
  name: z.string(),
  title: translatedSchema,
  size: z.enum(['small', 'medium', 'large']),
  side: z.boolean(),
});

export type PluginDialog = z.infer<typeof pluginDialogSchema>;

/**
 * Body of `GET /api/v1/plugin-screens/:pluginSlug/dialogs`: the plugin, named as its dialogs
 * show it, and the dialogs of it the signed-in person may open.
 */
export const pluginDialogsResponseSchema = z.object({
  plugin: translatedSchema,
  dialogs: z.array(pluginDialogSchema),
});

export type PluginDialogsResponse = z.infer<typeof pluginDialogsResponseSchema>;

/** What a picker of a plugin's screen finds at most: the best few, never a page. */
export const PICK_LIMIT = 20;

/**
 * Query of `GET /api/v1/plugins/:pluginSlug/pick/issues` and `…/people`: what is typed (an
 * issue's key or words of its title, a person's name), and one project, if the screen says.
 */
export const pickQuerySchema = z.object({
  search: z.string().trim().max(100).default(''),
  projectId: z.uuid().optional(),
});

export type PickQuery = z.input<typeof pickQuerySchema>;

export const pickedIssuesResponseSchema = z.object({
  issues: z
    .array(
      z.object({
        id: z.uuid(),
        key: z.string(),
        title: z.string(),
        projectId: z.uuid(),
        projectKey: z.string(),
      }),
    )
    .max(PICK_LIMIT),
});

export type PickedIssuesResponse = z.infer<typeof pickedIssuesResponseSchema>;

export const pickedPeopleResponseSchema = z.object({
  people: z.array(z.object({ id: z.uuid(), name: z.string() })).max(PICK_LIMIT),
});

export type PickedPeopleResponse = z.infer<typeof pickedPeopleResponseSchema>;
