import { z } from 'zod';
import { ENTITY_NAME } from './entities.ts';

/**
 * What a plugin's property holds: a number, a line of text, a calendar day, a box ticked. Toppo's
 * own types (`PROPERTY_TYPES` in `@toppo-tracker/shared`), but those with options or people.
 */
export const PLUGIN_PROPERTY_TYPES = ['number', 'text', 'date', 'checkbox'] as const;

export type PluginPropertyType = (typeof PLUGIN_PROPERTY_TYPES)[number];

/** How a number shows: `duration` reads minutes as "6 h 40". */
export const PROPERTY_DISPLAYS = ['duration'] as const;

export type PropertyDisplay = (typeof PROPERTY_DISPLAYS)[number];

/** At most this many properties a plugin adds to issues. */
export const PLUGIN_PROPERTIES_MAX = 5;

/**
 * A property a plugin adds to issues: named by one of its message keys, typed in by people, or
 * written by the plugin alone.
 */
export const pluginPropertySchema = z.strictObject({
  /** A key of its messages: the property's name when the plugin is approved. */
  name: z.string().max(200),
  type: z.enum(PLUGIN_PROPERTY_TYPES),
  display: z.enum(PROPERTY_DISPLAYS).optional(),
  writtenBy: z.enum(['people', 'plugin']),
});

export type PluginPropertyDeclaration = z.infer<typeof pluginPropertySchema>;

export const propertiesSchema = z
  .record(z.string().regex(ENTITY_NAME, 'A property is named like timeSpent'), pluginPropertySchema)
  .refine((properties) => Object.keys(properties).length <= PLUGIN_PROPERTIES_MAX, {
    message: `At most ${PLUGIN_PROPERTIES_MAX} properties`,
  });

/**
 * Refuses properties from a plugin that does not read issues, which could neither write nor read
 * them, and a display a property's type has not: only a number shows as a duration.
 */
export function checkProperties(
  manifest: {
    needs: readonly string[];
    properties: Readonly<Record<string, PluginPropertyDeclaration>>;
  },
  ctx: z.RefinementCtx,
): void {
  if (Object.keys(manifest.properties).length > 0 && !manifest.needs.includes('issue.read')) {
    ctx.addIssue({
      code: 'custom',
      path: ['properties'],
      message: 'Properties are on issues: the plugin needs issue.read',
    });
  }
  for (const [name, property] of Object.entries(manifest.properties)) {
    if (property.display !== undefined && property.type !== 'number') {
      ctx.addIssue({
        code: 'custom',
        path: ['properties', name, 'display'],
        message: `${name} is no number: it has no display`,
      });
    }
  }
}
