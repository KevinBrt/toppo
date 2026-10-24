import { effectiveProperties, type PropertyRules } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import type { IssuePropertyField, ProjectFields } from '@toppo/shared';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projectProperties, projects, properties, propertyOptions } = schema;

/**
 * The properties a project's issues take, with their options (`effectiveProperties`): the
 * instance's it keeps, with its own options where it has them, then its own. Locked, the options
 * cannot be deleted while an issue is being given one.
 */
async function effectiveOf(db: Pick<Db, 'select'>, projectId: string, { lock }: { lock: boolean }) {
  const defined = await db
    .select({
      id: properties.id,
      projectId: properties.projectId,
      name: properties.name,
      shownInList: properties.shownInList,
      askedAtCreation: properties.askedAtCreation,
      required: properties.required,
    })
    .from(properties)
    .where(or(isNull(properties.projectId), eq(properties.projectId, projectId)))
    .orderBy(asc(properties.createdAt), asc(properties.id));
  if (defined.length === 0) {
    return [];
  }
  const options = db
    .select({
      id: propertyOptions.id,
      propertyId: propertyOptions.propertyId,
      projectId: propertyOptions.projectId,
      name: propertyOptions.name,
      color: propertyOptions.color,
    })
    .from(propertyOptions)
    .where(
      and(
        inArray(
          propertyOptions.propertyId,
          defined.map(({ id }) => id),
        ),
        or(isNull(propertyOptions.projectId), eq(propertyOptions.projectId, projectId)),
      ),
    )
    .orderBy(asc(propertyOptions.position));
  const adaptations = await db
    .select({
      propertyId: projectProperties.propertyId,
      hidden: projectProperties.hidden,
      ownOptions: projectProperties.ownOptions,
    })
    .from(projectProperties)
    .where(eq(projectProperties.projectId, projectId));
  return effectiveProperties(
    projectId,
    defined,
    await (lock ? options.for('share') : options),
    adaptations,
  );
}

/** The properties a project's issues take, oldest first, as the forms offer them. */
export async function propertyFields(
  db: Pick<Db, 'select'>,
  projectId: string,
): Promise<IssuePropertyField[]> {
  return (await effectiveOf(db, projectId, { lock: false })).map(
    ({ projectId: _, options, ...property }) => ({
      ...property,
      options: options.map(({ id, name, color }) => ({ id, name, color })),
    }),
  );
}

/** What decides the values a project's issues may take, the options share-locked. */
export async function lockedPropertyRules(
  tx: Transaction,
  projectId: string,
): Promise<(PropertyRules & { name: string; options: { id: string; name: string }[] })[]> {
  return (await effectiveOf(tx, projectId, { lock: true })).map(
    ({ id, name, askedAtCreation, required, options }) => ({
      id,
      name,
      askedAtCreation,
      required,
      optionIds: options.map((option) => option.id),
      options: options.map((option) => ({ id: option.id, name: option.name })),
    }),
  );
}

/** How a project adapts the category and the priority of its issues. */
export async function fieldSettingsOf(
  db: Pick<Db, 'select'>,
  projectId: string,
): Promise<ProjectFields> {
  const [row] = await db
    .select({
      categoryHidden: projects.categoryHidden,
      categoryRequired: projects.categoryRequired,
      priorityHidden: projects.priorityHidden,
      priorityRequired: projects.priorityRequired,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
  }
  return {
    category: { hidden: row.categoryHidden, required: row.categoryRequired },
    priority: { hidden: row.priorityHidden, required: row.priorityRequired },
  };
}
