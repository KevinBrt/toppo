import { z } from 'zod';
import { PROPERTIES_MAX } from './properties.ts';

/** Words a filter's values may hold besides ids: no value, the caller, a box ticked or not. */
export const PROPERTY_FILTER_WORDS = ['none', 'me', 'yes', 'no'] as const;

/** Values of one filter: as many as the other filters of a list take. */
const FILTER_VALUES_MAX = 50;

/** One end of a range, a number or a day, its meaning checked against the property's type. */
const rangeEndSchema = z.string().regex(/^[0-9eE.+-]{1,25}$/);

/**
 * A filter on a property, as a list asks for it: the values any of which an issue has (options,
 * people, `none`, `me`; `yes` or `no` for a box), or a range of numbers or days, open on one
 * side. What each type of property takes is checked once the property is known
 * (`propertyConditionOf` in `@toppo/core`).
 */
export const propertyFilterSchema = z.union([
  z.object({
    propertyId: z.uuid(),
    values: z
      .array(z.union([z.uuid(), z.enum(PROPERTY_FILTER_WORDS)]))
      .min(1)
      .max(FILTER_VALUES_MAX),
  }),
  z
    .object({
      propertyId: z.uuid(),
      from: rangeEndSchema.nullable(),
      to: rangeEndSchema.nullable(),
    })
    .refine(({ from, to }) => from !== null || to !== null, {
      message: 'A range has at least one end',
    }),
]);

export type PropertyFilter = z.infer<typeof propertyFilterSchema>;

/** Splits a range on its two dots: `2..5`, `2026-11-01..`, `..10`. */
const RANGE = /^(.*)\.\.(.*)$/;

/**
 * The filters a text names, as they come, for `propertyFilterSchema` to check: `<id>:<a>,<b>`
 * for values, `<id>:<from>..<to>` for a range, filters joined by `;`.
 */
export function parsePropertyFilters(text: string): unknown[] {
  return text
    .split(';')
    .filter((part) => part !== '')
    .map((part) => {
      const colon = part.indexOf(':');
      const propertyId = colon === -1 ? part : part.slice(0, colon);
      const spec = colon === -1 ? '' : part.slice(colon + 1);
      const range = RANGE.exec(spec);
      if (range) {
        return { propertyId, from: range[1] || null, to: range[2] || null };
      }
      return { propertyId, values: spec.split(',').filter((value) => value !== '') };
    });
}

/** Filters as a query string and the address keep them, the way `parsePropertyFilters` reads. */
export function formatPropertyFilters(filters: readonly PropertyFilter[]): string {
  return filters
    .map((filter) =>
      'values' in filter
        ? `${filter.propertyId}:${filter.values.join(',')}`
        : `${filter.propertyId}:${filter.from ?? ''}..${filter.to ?? ''}`,
    )
    .join(';');
}

/**
 * The `property` parameter of a project's list: filters as text, or already split by a caller
 * that is not HTTP; at most one per property.
 */
export const propertyFiltersParameter = z
  .union([z.string().max(4000).transform(parsePropertyFilters), z.array(z.unknown())])
  .pipe(
    z
      .array(propertyFilterSchema)
      .max(PROPERTIES_MAX * 2)
      .refine(
        (filters) => new Set(filters.map(({ propertyId }) => propertyId)).size === filters.length,
        { message: 'A property is filtered once' },
      ),
  )
  .optional();
