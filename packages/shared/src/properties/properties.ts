import { z } from 'zod';
import { PALETTE_COLORS } from '../colors.ts';
import { checkDistinctOptions } from '../issues/options.ts';

/** Kinds of properties: a list of options first; multi-select, text, number, date… to come. */
export const PROPERTY_TYPES = ['list'] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Properties of the instance: few enough for the forms and the issue's side to show them all. */
export const PROPERTIES_MAX = 20;

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

/** Body of `POST /api/v1/properties`: a new property of the instance, with its options in order. */
export const createPropertyRequestSchema = propertyFieldsSchema
  .extend({
    type: z.enum(PROPERTY_TYPES),
    options: z
      .array(propertyOptionDraftSchema.omit({ id: true }))
      .min(1)
      .max(PROPERTY_OPTIONS_MAX)
      .superRefine(checkDistinctOptions),
  })
  .refine(askedIfRequired, { message: 'Only a property asked at creation is required' });

export type CreatePropertyRequest = z.input<typeof createPropertyRequestSchema>;

/**
 * Body of `PUT /api/v1/properties/:propertyId`: the property and all its options, in their new
 * order, saved at once, and the options it deletes, taken off their issues.
 */
export const updatePropertyRequestSchema = propertyFieldsSchema
  .extend({
    options: z
      .array(propertyOptionDraftSchema)
      .min(1)
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

/** Body of `GET /api/v1/properties`: every property, oldest first, with what uses its options. */
export const propertiesResponseSchema = z.object({
  properties: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        type: z.enum(PROPERTY_TYPES),
        shownInList: z.boolean(),
        askedAtCreation: z.boolean(),
        required: z.boolean(),
        /** In their order, each with how many issues have it. */
        options: z.array(propertyOptionRefSchema.extend({ issueCount: z.number().int() })),
      }),
    )
    .max(PROPERTIES_MAX),
});

export type PropertiesResponse = z.infer<typeof propertiesResponseSchema>;

export type PropertyRow = PropertiesResponse['properties'][number];

/** A property as the issue forms offer it: what it asks, and its options in order. */
export const issuePropertyFieldSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  shownInList: z.boolean(),
  askedAtCreation: z.boolean(),
  required: z.boolean(),
  options: z.array(propertyOptionRefSchema),
});

export type IssuePropertyField = z.infer<typeof issuePropertyFieldSchema>;

/** The value of one property on an issue: the property, and the option it has. */
export const issuePropertyValueSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  option: propertyOptionRefSchema,
});

export type IssuePropertyValue = z.infer<typeof issuePropertyValueSchema>;

/** Body of `PUT /api/v1/issues/:issueKey/properties/:propertyId`: the option, or none. */
export const issuePropertyRequestSchema = z.object({ optionId: z.uuid().nullable() });

export type IssuePropertyRequest = z.infer<typeof issuePropertyRequestSchema>;
