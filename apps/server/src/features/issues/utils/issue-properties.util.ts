import { effectiveProperties, type PropertyProblem, type PropertyRules } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import type { IssuePropertyField, ProjectFields } from '@toppo-tracker/shared';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { reachesProject } from './people.util.ts';

const { projectProperties, projects, properties, propertyOptions } = schema;

/** What the caller is told when a value cannot be given. */
const PROPERTY_REFUSALS: Readonly<
  Record<PropertyProblem['problem'], [code: string, message: string]>
> = {
  unknownProperty: ['PROPERTY_NOT_FOUND', 'This property does not exist'],
  invalidValue: ['INVALID_PROPERTY_VALUE', 'This value does not suit the property'],
  unknownOption: ['INVALID_PROPERTY_OPTION', 'This option is not one of the property'],
  missingRequired: ['PROPERTY_REQUIRED', 'This property is required'],
};

export function propertyRefusal({ problem }: PropertyProblem): HttpError {
  const [code, message] = PROPERTY_REFUSALS[problem];
  return new HttpError(400, code, message);
}

/** Refuses anyone a person property cannot name: as for an assignee, who reaches the project. */
export async function assertNameable(
  tx: Transaction,
  projectId: string,
  userIds: readonly string[],
): Promise<void> {
  for (const userId of new Set(userIds)) {
    if (!(await reachesProject(tx, projectId, userId))) {
      throw new HttpError(400, 'INVALID_PROPERTY_USER', 'This person cannot be named here');
    }
  }
}

/**
 * The properties a project's issues take, with their options (`effectiveProperties`): the
 * instance's it keeps, with its own options where it has them, then its own. Locked, neither the
 * properties nor their options can be deleted while an issue is being given a value.
 */
async function effectiveOf(db: Pick<Db, 'select'>, projectId: string, { lock }: { lock: boolean }) {
  const query = db
    .select({
      id: properties.id,
      projectId: properties.projectId,
      name: properties.name,
      type: properties.type,
      shownInList: properties.shownInList,
      askedAtCreation: properties.askedAtCreation,
      required: properties.required,
    })
    .from(properties)
    .where(or(isNull(properties.projectId), eq(properties.projectId, projectId)))
    .orderBy(asc(properties.createdAt), asc(properties.id));
  const defined = await (lock ? query.for('share') : query);
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
    ({ id, name, type, askedAtCreation, required, options }) => ({
      id,
      name,
      type,
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
