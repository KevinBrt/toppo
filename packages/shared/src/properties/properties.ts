import { z } from 'zod';
import { PALETTE_COLORS } from '../colors.ts';
import { checkDistinctOptions } from '../issues/options.ts';

/**
 * Kinds of properties: one option of a list, several, a line of text, a number, a calendar date,
 * someone who reaches the project, or a box ticked. Chosen once: a property never changes kind.
 */
export const PROPERTY_TYPES = [
  'list',
  'multiSelect',
  'text',
  'number',
  'date',
  'user',
  'checkbox',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** The types whose values are options of their own, edited in the settings. */
export const PROPERTY_TYPES_WITH_OPTIONS: readonly PropertyType[] = ['list', 'multiSelect'];

export const hasOptions = (type: PropertyType): boolean =>
  PROPERTY_TYPES_WITH_OPTIONS.includes(type);

/** Properties of the instance: few enough for the forms and the issue's side to show them all. */
export const PROPERTIES_MAX = 20;

/** Who writes a property's values: people, or the plugin that added it alone, without activity. */
export const PROPERTY_WRITERS = ['people', 'plugin'] as const;

export type PropertyWriter = (typeof PROPERTY_WRITERS)[number];

/** How a number shows: `duration` reads minutes as "6 h 40". */
export const PROPERTY_DISPLAYS = ['duration'] as const;

export type PropertyDisplay = (typeof PROPERTY_DISPLAYS)[number];

/** What a property says of how its values are written and shown. */
const propertyWritingSchema = z.object({
  writtenBy: z.enum(PROPERTY_WRITERS),
  display: z.enum(PROPERTY_DISPLAYS).nullable(),
});

/** Options of one property, short enough to be read whole in a menu. */
export const PROPERTY_OPTIONS_MAX = 100;

/** Mirrors the `properties_name_length` and `property_options_name_length` checks. */
export const PROPERTY_NAME_MAX_LENGTH = 40;

const propertyNameSchema = z.string().trim().min(1).max(PROPERTY_NAME_MAX_LENGTH);

/** An option as an issue, a list or a menu shows it. */
export const propertyOptionRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_COLORS),
});

export type PropertyOptionRef = z.infer<typeof propertyOptionRefSchema>;

/** An option as the settings save it: an existing one by its id, a new one without. */
export const propertyOptionDraftSchema = z.object({
  id: z.uuid().optional(),
  name: propertyNameSchema,
  color: z.enum(PALETTE_COLORS),
});

export type PropertyOptionDraft = z.input<typeof propertyOptionDraftSchema>;

/** What a property says about issues: its name, where it shows, whether it is asked first. */
const propertyFieldsSchema = z.object({
  name: propertyNameSchema,
  /** A column of the issue list, and a chip of each issue on phones. */
  shownInList: z.boolean(),
  /** A field of the new issue form. */
  askedAtCreation: z.boolean(),
  /** An issue cannot be created without it; only a property asked at creation can be. */
  required: z.boolean(),
});

const askedIfRequired = ({ askedAtCreation, required }: z.infer<typeof propertyFieldsSchema>) =>
  askedAtCreation || !required;

/**
 * Body of `POST /api/v1/properties`: a new property of the instance, of its type for good, with
 * its options in order if its type has some. A box that must be ticked would say nothing: a
 * checkbox is never required.
 */
export const createPropertyRequestSchema = propertyFieldsSchema
  .extend({
    type: z.enum(PROPERTY_TYPES),
    options: z
      .array(propertyOptionDraftSchema.omit({ id: true }))
      .max(PROPERTY_OPTIONS_MAX)
      .superRefine(checkDistinctOptions)
      .default([]),
  })
  .refine(askedIfRequired, { message: 'Only a property asked at creation is required' })
  .refine(({ type, options }) => hasOptions(type) === options.length > 0, {
    message: 'A list or a multi-select has options, no other type does',
    path: ['options'],
  })
  .refine(({ type, required }) => type !== 'checkbox' || !required, {
    message: 'A checkbox is never required',
    path: ['required'],
  });

export type CreatePropertyRequest = z.input<typeof createPropertyRequestSchema>;

/**
 * Body of `PUT /api/v1/properties/:propertyId`: the property and all its options, in their new
 * order, saved at once, and the options it deletes, taken off their issues. Its type stays: a
 * property without options saves none.
 */
export const updatePropertyRequestSchema = propertyFieldsSchema
  .extend({
    options: z
      .array(propertyOptionDraftSchema)
      .max(PROPERTY_OPTIONS_MAX)
      .superRefine(checkDistinctOptions),
    /**
     * Named rather than left out: an option added by someone else meanwhile, missing from the
     * list too, is never deleted by mistake.
     */
    removed: z.array(z.uuid()).max(PROPERTY_OPTIONS_MAX),
  })
  .refine(askedIfRequired, { message: 'Only a property asked at creation is required' })
  .refine(
    ({ options, removed }) => !options.some(({ id }) => id !== undefined && removed.includes(id)),
    { message: 'An option is kept and removed', path: ['removed'] },
  );

export type UpdatePropertyRequest = z.input<typeof updatePropertyRequestSchema>;

export const propertyParamsSchema = z.object({ propertyId: z.uuid() });

export const createPropertyResponseSchema = z.object({ id: z.uuid() });

/**
 * The plugin that added a property, by id and in each language, and whether it is installed:
 * while it is, the property stays, its type and who writes it with it.
 */
export const propertyPluginSchema = z.object({
  slug: z.string(),
  name: z.object({ en: z.string(), fr: z.string() }),
  installed: z.boolean(),
});

export type PropertyPlugin = z.infer<typeof propertyPluginSchema>;

/**
 * A property as the settings show it, with how many issues have a value of it, and each option
 * with how many have that one.
 */
export const propertyRowSchema = propertyWritingSchema.extend({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(PROPERTY_TYPES),
  shownInList: z.boolean(),
  askedAtCreation: z.boolean(),
  required: z.boolean(),
  /** The plugin that added it; `null` for one of the instance's or a project's own. */
  plugin: propertyPluginSchema.nullable(),
  /** Issues having a value of it: deleting it takes the values off them. */
  issueCount: z.number().int(),
  /** In their order, each with how many issues have it; none unless its type has options. */
  options: z.array(propertyOptionRefSchema.extend({ issueCount: z.number().int() })),
});

/** Body of `GET /api/v1/properties`: every property of the instance, oldest first. */
export const propertiesResponseSchema = z.object({
  properties: z.array(propertyRowSchema).max(PROPERTIES_MAX),
});

export type PropertiesResponse = z.infer<typeof propertiesResponseSchema>;

export type PropertyRow = PropertiesResponse['properties'][number];

/**
 * A property as the issue forms offer it: its type, what it asks, its options in order, and who
 * writes it (people never type in what a plugin writes).
 */
export const issuePropertyFieldSchema = propertyWritingSchema.extend({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(PROPERTY_TYPES),
  shownInList: z.boolean(),
  askedAtCreation: z.boolean(),
  required: z.boolean(),
  /** None unless its type has options. */
  options: z.array(propertyOptionRefSchema),
});

export type IssuePropertyField = z.infer<typeof issuePropertyFieldSchema>;

/** How a project adapts one of the issues' fields: hidden there, or asked without a default. */
export const projectFieldSettingSchema = z
  .object({ hidden: z.boolean(), required: z.boolean() })
  .refine(({ hidden, required }) => !(hidden && required), {
    message: 'A hidden field cannot be required',
  });

/**
 * Body of `PUT /api/v1/projects/:projectKey/fields`: how the project adapts the category and the
 * priority of its issues.
 */
export const projectFieldsSchema = z.object({
  category: projectFieldSettingSchema,
  priority: projectFieldSettingSchema,
});

export type ProjectFields = z.infer<typeof projectFieldsSchema>;

/**
 * Body of `PUT /api/v1/projects/:projectKey/properties/:propertyId/adaptation`: how the project
 * adapts a property of the instance. With `options`, its own options in their order, and those
 * it removes, replace the instance's there (starting from them, by their ids); `null` takes the
 * instance's again.
 */
export const propertyAdaptationRequestSchema = z.object({
  hidden: z.boolean(),
  options: z
    .object({
      options: z
        .array(propertyOptionDraftSchema)
        .min(1)
        .max(PROPERTY_OPTIONS_MAX)
        .superRefine(checkDistinctOptions),
      removed: z.array(z.uuid()).max(PROPERTY_OPTIONS_MAX),
    })
    .refine(
      ({ options, removed }) => !options.some(({ id }) => id !== undefined && removed.includes(id)),
      { message: 'An option is kept and removed', path: ['removed'] },
    )
    .nullable(),
});

export type PropertyAdaptationRequest = z.input<typeof propertyAdaptationRequestSchema>;

/**
 * Body of `GET /api/v1/projects/:projectKey/properties`: how the project adapts the category, the
 * priority and the instance's properties, then its own properties, each option with how many of
 * the project's issues have it.
 */
export const projectPropertiesResponseSchema = z.object({
  fields: projectFieldsSchema,
  /** Oldest first, with the project's own options where it has them. */
  instance: z.array(propertyRowSchema.extend({ hidden: z.boolean(), ownOptions: z.boolean() })),
  /** Oldest first. */
  own: z.array(propertyRowSchema),
});

export type ProjectPropertiesResponse = z.infer<typeof projectPropertiesResponseSchema>;
