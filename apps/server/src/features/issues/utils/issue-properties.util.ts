import type { PropertyRules } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import type { IssuePropertyField } from '@toppo/shared';
import { asc, eq } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { properties, propertyOptions } = schema;

/** Every property of the instance, oldest first, with its options in their order. */
export async function propertyFields(db: Pick<Db, 'select'>): Promise<IssuePropertyField[]> {
  const rows = await db
    .select({
      property: {
        id: properties.id,
        name: properties.name,
        shownInList: properties.shownInList,
        askedAtCreation: properties.askedAtCreation,
        required: properties.required,
      },
      option: { id: propertyOptions.id, name: propertyOptions.name, color: propertyOptions.color },
    })
    .from(properties)
    .innerJoin(propertyOptions, eq(propertyOptions.propertyId, properties.id))
    .orderBy(asc(properties.createdAt), asc(properties.id), asc(propertyOptions.position));
  const fields = new Map<string, IssuePropertyField>();
  for (const { property, option } of rows) {
    const field = fields.get(property.id) ?? { ...property, options: [] };
    field.options.push(option);
    fields.set(property.id, field);
  }
  return [...fields.values()];
}

/**
 * What decides the values an issue may take, its options share-locked: none can be deleted
 * while an issue is being given it.
 */
export async function lockedPropertyRules(tx: Transaction): Promise<PropertyRules[]> {
  const rows = await tx
    .select({
      id: properties.id,
      askedAtCreation: properties.askedAtCreation,
      required: properties.required,
      optionId: propertyOptions.id,
    })
    .from(properties)
    .innerJoin(propertyOptions, eq(propertyOptions.propertyId, properties.id))
    .for('share', { of: propertyOptions });
  const rules = new Map<string, PropertyRules & { optionIds: string[] }>();
  for (const { optionId, ...property } of rows) {
    const rule = rules.get(property.id) ?? { ...property, optionIds: [] };
    rule.optionIds.push(optionId);
    rules.set(property.id, rule);
  }
  return [...rules.values()];
}
