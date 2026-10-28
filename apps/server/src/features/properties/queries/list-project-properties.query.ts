import { schema } from '@toppo-tracker/db';
import {
  type ProjectPropertiesResponse,
  type PropertyRow,
  projectIssuesParamsSchema,
} from '@toppo-tracker/shared';
import { and, asc, count, eq, inArray, isNull, or } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { issuesChoosing, issuesWithValue } from '../utils/property-counts.util.ts';

const { issues, projectProperties, projects, properties, propertyOptions } = schema;

/**
 * How a project adapts the issues' fields: the category, the priority, each property of the
 * instance (hidden, its own options), then its own properties, each with how many of the
 * project's issues have a value of it, and each option with how many have that one.
 */
export const listProjectProperties = defineQuery({
  name: 'property.listInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectIssuesParamsSchema,
  async handler({ db, project }): Promise<ProjectPropertiesResponse> {
    const [fields] = await db
      .select({
        categoryHidden: projects.categoryHidden,
        categoryRequired: projects.categoryRequired,
        priorityHidden: projects.priorityHidden,
        priorityRequired: projects.priorityRequired,
      })
      .from(projects)
      .where(eq(projects.id, project.id));
    if (!fields) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
    }
    const defined = await db
      .select({
        id: properties.id,
        projectId: properties.projectId,
        name: properties.name,
        type: properties.type,
        shownInList: properties.shownInList,
        askedAtCreation: properties.askedAtCreation,
        required: properties.required,
        issueCount: count(issues.id),
      })
      .from(properties)
      .leftJoin(issues, issuesWithValue(project.id))
      .where(or(isNull(properties.projectId), eq(properties.projectId, project.id)))
      .groupBy(properties.id)
      .orderBy(asc(properties.createdAt), asc(properties.id));
    const options =
      defined.length === 0
        ? []
        : await db
            .select({
              propertyId: propertyOptions.propertyId,
              projectId: propertyOptions.projectId,
              id: propertyOptions.id,
              name: propertyOptions.name,
              color: propertyOptions.color,
              issueCount: issuesChoosing(project.id),
            })
            .from(propertyOptions)
            .innerJoin(properties, eq(properties.id, propertyOptions.propertyId))
            .where(
              and(
                inArray(
                  propertyOptions.propertyId,
                  defined.map(({ id }) => id),
                ),
                or(isNull(propertyOptions.projectId), eq(propertyOptions.projectId, project.id)),
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
      .where(eq(projectProperties.projectId, project.id));
    const adaptationOf = (propertyId: string) =>
      adaptations.find((adaptation) => adaptation.propertyId === propertyId);
    const rowOf = ({ projectId, ...property }: (typeof defined)[number]): PropertyRow => {
      // The instance's options, or the project's own where it has them, never both.
      const ownOptions = projectId === null && Boolean(adaptationOf(property.id)?.ownOptions);
      return {
        ...property,
        options: options
          .filter(
            (option) =>
              option.propertyId === property.id && (option.projectId !== null) === ownOptions,
          )
          .map(({ id, name, color, issueCount }) => ({ id, name, color, issueCount })),
      };
    };
    return {
      fields: {
        category: { hidden: fields.categoryHidden, required: fields.categoryRequired },
        priority: { hidden: fields.priorityHidden, required: fields.priorityRequired },
      },
      instance: defined
        .filter(({ projectId }) => projectId === null)
        .map((property) => ({
          ...rowOf(property),
          hidden: adaptationOf(property.id)?.hidden ?? false,
          ownOptions: adaptationOf(property.id)?.ownOptions ?? false,
        })),
      own: defined.filter(({ projectId }) => projectId !== null).map(rowOf),
    };
  },
});
