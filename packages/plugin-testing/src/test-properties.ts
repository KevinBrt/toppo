import { z } from '@toppo-tracker/plugin-sdk';
import {
  HOST_CALLS,
  type IssueDetails,
  type Manifest,
  type PluginPropertyType,
} from '@toppo-tracker/plugin-sdk/protocol';

/** A property's value as Toppo keeps it on an issue: a number, a text, a day, a box ticked. */
type Kept = IssueDetails['properties'][string];

/** The largest number a property holds, as Toppo's own properties (`PROPERTY_NUMBER_MAX`). */
const NUMBER_MAX = 999_999_999_999_999;

/** What Toppo takes of each type, as it checks its own properties' values. */
const VALUES = {
  number: z.number().min(-NUMBER_MAX).max(NUMBER_MAX),
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^[^\n\r]*$/),
  date: z.iso.date(),
  checkbox: z.literal(true),
} as const satisfies Record<PluginPropertyType, z.ZodType<Kept>>;

const refusal = (code: string) => new Error(code);

/**
 * The values of a plugin's properties on issues, kept in memory with Toppo's rules: the plugin
 * writes those it declares written by it, on issues `visible` lets it reach, each checked against
 * its type; `null`, or `false` for a box, takes it away.
 */
export function createTestProperties(
  manifest: Manifest,
  issues: Map<string, IssueDetails>,
  visible: (issueId: string) => IssueDetails | undefined,
) {
  return {
    /** Toppo's answer to `issues.setProperty`. */
    set(args: unknown): null {
      const { issueId, property, value } = HOST_CALLS['issues.setProperty'].args.parse(args);
      const declared = Object.hasOwn(manifest.properties, property)
        ? manifest.properties[property]
        : undefined;
      if (declared?.writtenBy !== 'plugin') {
        throw refusal('PROPERTY_NOT_FOUND');
      }
      const issue = visible(issueId);
      if (!issue) {
        throw refusal('NOT_FOUND');
      }
      const { [property]: _, ...others } = issue.properties;
      if (value === null || value === false) {
        issues.set(issueId, { ...issue, properties: others });
        return null;
      }
      const checked = VALUES[declared.type].safeParse(value);
      if (!checked.success) {
        throw refusal('INVALID_PROPERTY_VALUE');
      }
      issues.set(issueId, { ...issue, properties: { ...others, [property]: checked.data } });
      return null;
    },
  };
}
