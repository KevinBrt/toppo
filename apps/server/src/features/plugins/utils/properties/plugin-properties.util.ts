import { propertyChangeOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import {
  type Locale,
  PROPERTIES_MAX,
  PROPERTY_NAME_MAX_LENGTH,
  type PropertyValue,
} from '@toppo-tracker/shared';
import { count, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { lockPropertyAdding } from '../../../../platform/plugins/plugin-properties.ts';
import { messageAt, pluginNameOf } from '../../../../platform/plugins/plugin-words.ts';

const { issues, properties } = schema;

/** Activities written at once, as for any change made in bulk. */
const BATCH = 1000;

/** Names tried for a property, its plugin's name after, before giving up. */
const NAMES_TRIED = 10;

/** The properties a plugin added, kept or not by its versions since, by their names in it. */
async function propertiesOfPlugin(tx: Transaction, slug: string) {
  return await tx
    .select({
      id: properties.id,
      name: properties.name,
      key: properties.pluginProperty,
      type: properties.type,
      writtenBy: properties.writtenBy,
    })
    .from(properties)
    .where(eq(properties.pluginSlug, slug))
    .for('update');
}

/**
 * Refuses a version that changes the type of a property the plugin added, or who writes it: its
 * values were written as they were, by those who did. How a number shows may change: the new
 * version says so for good.
 */
export async function keepPluginProperties(tx: Transaction, manifest: Manifest): Promise<void> {
  for (const held of await propertiesOfPlugin(tx, manifest.id)) {
    const declared =
      held.key !== null && Object.hasOwn(manifest.properties, held.key)
        ? manifest.properties[held.key]
        : undefined;
    if (!declared) {
      continue;
    }
    if (declared.type !== held.type || declared.writtenBy !== held.writtenBy) {
      throw new HttpError(
        400,
        'PLUGIN_PROPERTY_CHANGED',
        `This version changes the property ${held.key}: its type and who writes it stay`,
      );
    }
    await tx
      .update(properties)
      .set({ display: declared.display ?? null })
      .where(eq(properties.id, held.id));
  }
}

/** A name no property has, wherever it may show, the instance's showing in every project. */
async function freeName(tx: Transaction, base: string, pluginName: string): Promise<string> {
  const shortened = (name: string) => name.slice(0, PROPERTY_NAME_MAX_LENGTH).trim();
  const after = (suffix: string) =>
    shortened(`${base.slice(0, Math.max(0, PROPERTY_NAME_MAX_LENGTH - suffix.length))}${suffix}`);
  const candidates = [
    shortened(base),
    after(` (${pluginName})`),
    ...Array.from({ length: NAMES_TRIED - 2 }, (_, at) => after(` (${pluginName} ${at + 2})`)),
  ];
  for (const candidate of candidates) {
    const [taken] = await tx
      .select({ id: properties.id })
      .from(properties)
      .where(sql`lower(${properties.name}) = lower(${candidate})`)
      .limit(1);
    if (!taken) {
      return candidate;
    }
  }
  throw new HttpError(409, 'PROPERTY_NAME_TAKEN', 'Another property has this name');
}

/**
 * Adds the properties the plugin declares that the instance does not have yet, as it is
 * approved: named by its messages in the language of whoever approves it, its name after one
 * already taken. Those it added before (by a version since gone, or before it was uninstalled
 * with its data) are found again, with their names and values. They count among the instance's.
 */
export async function addPluginProperties(
  tx: Transaction,
  manifest: Manifest,
  locale: Locale,
): Promise<void> {
  const declared = Object.entries(manifest.properties);
  if (declared.length === 0) {
    return;
  }
  await lockPropertyAdding(tx);
  const held = await propertiesOfPlugin(tx, manifest.id);
  const missing = declared.filter(([key]) => !held.some((property) => property.key === key));
  if (missing.length === 0) {
    return;
  }
  const [defined] = await tx
    .select({ count: count() })
    .from(properties)
    .where(isNull(properties.projectId));
  const room = PROPERTIES_MAX - (defined?.count ?? 0);
  if (missing.length > room) {
    throw new HttpError(
      409,
      'PROPERTY_LIMIT_REACHED',
      `This plugin adds ${missing.length} properties; the instance has room for ${Math.max(room, 0)} of its ${PROPERTIES_MAX}`,
    );
  }
  const pluginName = pluginNameOf(manifest)[locale];
  for (const [key, property] of missing) {
    const said =
      messageAt(manifest.messages[locale], property.name) ??
      messageAt(manifest.messages.en, property.name);
    await tx.insert(properties).values({
      name: await freeName(tx, said?.trim() || key, pluginName),
      type: property.type,
      pluginSlug: manifest.id,
      pluginProperty: key,
      writtenBy: property.writtenBy,
      display: property.display ?? null,
    });
  }
}

/** The issues having a value of `propertyId`, and that value. */
async function valuesOf(tx: Transaction, propertyId: string) {
  return await tx
    .select({
      id: issues.id,
      projectId: issues.projectId,
      value: sql<PropertyValue>`${issues.properties} -> ${propertyId}`,
    })
    .from(issues)
    .where(hasValue(propertyId))
    .for('update');
}

function hasValue(propertyId: string): SQL {
  return sql`${issues.properties} ? ${propertyId}`;
}

function withoutValue(propertyId: string): SQL {
  return sql`${issues.properties} - ${propertyId}`;
}

/**
 * Deletes the properties a plugin added, as it is uninstalled with its data, and their values.
 * Those people typed in leave each issue told in its history, as any property deleted; those
 * the plugin wrote leave it as they came, without a word.
 */
export async function deletePluginProperties(
  tx: Transaction,
  slug: string,
  actorId: string,
): Promise<void> {
  for (const property of await propertiesOfPlugin(tx, slug)) {
    if (property.writtenBy === 'plugin') {
      await tx
        .update(issues)
        .set({ properties: withoutValue(property.id), updatedAt: sql`${issues.updatedAt}` })
        .where(hasValue(property.id));
    } else {
      const having = await valuesOf(tx, property.id);
      await tx
        .update(issues)
        .set({ properties: withoutValue(property.id), updatedAt: sql`now()` })
        .where(hasValue(property.id));
      for (let start = 0; start < having.length; start += BATCH) {
        await recordActivities(
          tx,
          having.slice(start, start + BATCH).map(({ id, projectId, value }) => ({
            projectId,
            issueId: id,
            actorId,
            type: 'issue.propertyChanged' as const,
            payload: propertyChangeOf(property, value, null, new Map()),
          })),
          { notify: false },
        );
      }
    }
    await tx.delete(properties).where(eq(properties.id, property.id));
  }
}
