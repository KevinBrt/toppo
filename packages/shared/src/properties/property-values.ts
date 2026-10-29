import { z } from 'zod';
import { userRefSchema } from '../members/users.ts';
import {
  PROPERTY_DISPLAYS,
  PROPERTY_OPTIONS_MAX,
  type PropertyType,
  propertyOptionRefSchema,
} from './properties.ts';

/** A line of text, short enough to show whole beside an issue. */
export const PROPERTY_TEXT_MAX_LENGTH = 500;

/** The largest number a property holds: beyond, JSON no longer keeps every digit. */
export const PROPERTY_NUMBER_MAX = 999_999_999_999_999;

const distinct = (ids: readonly string[]) => new Set(ids).size === ids.length;

/**
 * What each type of property stores on an issue (`issues.properties`, by property id): an option's
 * id, several, a line of text, a number, a calendar date, someone's id, or `true` for a box
 * ticked. Nothing is stored for no value: no option chosen, a box not ticked.
 */
export const PROPERTY_VALUE_SCHEMAS = {
  list: z.uuid(),
  multiSelect: z
    .array(z.uuid())
    .min(1)
    .max(PROPERTY_OPTIONS_MAX)
    .refine(distinct, { message: 'An option is chosen twice' }),
  text: z
    .string()
    .trim()
    .min(1)
    .max(PROPERTY_TEXT_MAX_LENGTH)
    .regex(/^[^\n\r]*$/, { message: 'A text property holds one line' }),
  number: z.number().min(-PROPERTY_NUMBER_MAX).max(PROPERTY_NUMBER_MAX),
  // A day rather than an instant: the same day wherever it is read.
  date: z.iso.date(),
  user: z.uuid(),
  checkbox: z.literal(true),
} as const satisfies Record<PropertyType, z.ZodType>;

/** A property's value as stored, whatever its type. */
export type PropertyValue = z.output<(typeof PROPERTY_VALUE_SCHEMAS)[PropertyType]>;

/**
 * A value as a request gives it: its shape is checked against its property's type once the
 * property is known (`propertyValueOf` in `@toppo-tracker/core`).
 */
export const givenPropertyValueSchema = z.union([
  z.string(),
  z.array(z.string()).max(PROPERTY_OPTIONS_MAX),
  z.number(),
  z.literal(true),
]);

/** Body of `PUT /api/v1/issues/:issueKey/properties/:propertyId`: the value, or none. */
export const issuePropertyRequestSchema = z.object({ value: givenPropertyValueSchema.nullable() });

export type IssuePropertyRequest = z.infer<typeof issuePropertyRequestSchema>;

const valued = <T extends PropertyType, V extends z.ZodType>(type: T, value: V) =>
  z.object({ id: z.uuid(), name: z.string(), type: z.literal(type), value });

/**
 * The value of one property on an issue, as it reads: its options in their order, someone by
 * name, a date as a calendar day, a number as its property shows it (minutes as a duration).
 */
export const issuePropertyValueSchema = z.discriminatedUnion('type', [
  valued('list', propertyOptionRefSchema),
  valued('multiSelect', z.array(propertyOptionRefSchema)),
  valued('text', z.string()),
  valued('number', z.number()).extend({ display: z.enum(PROPERTY_DISPLAYS).nullable() }),
  valued('date', z.iso.date()),
  valued('user', userRefSchema),
  valued('checkbox', z.literal(true)),
]);

export type IssuePropertyValue = z.infer<typeof issuePropertyValueSchema>;
