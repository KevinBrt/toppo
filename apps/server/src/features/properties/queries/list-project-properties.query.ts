import { schema } from '@toppo/db';
import { type ProjectPropertiesResponse, projectIssuesParamsSchema } from '@toppo/shared';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { issues, projectProperties, projects, properties, propertyOptions } = schema;

type Row = ProjectPropertiesResponse['own'][number];

/**
 * How a project adapts the issues' fields: the category, the priority, each property of the
 * instance (hidden, its own options), then its own properties, each option with how many of the
 * project's issues have it.
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
    const rows = await db
      .select({
        property: {
          id: properties.id,
          projectId: properties.projectId,
          name: properties.name,
          type: properties.type,
          shownInList: properties.shownInList,
          askedAtCreation: properties.askedAtCreation,
          required: properties.required,
        },
        option: {
          id: propertyOptions.id,
          projectId: propertyOptions.projectId,
          name: propertyOptions.name,
          color: propertyOptions.color,
          issueCount: sql<number>`(
            select ${count()} from ${issues}
            where ${issues.projectId} = ${project.id}
              and ${issues.properties} @> jsonb_build_object(${properties.id}::text, ${propertyOptions.id}::text)
          )`.mapWith(Number),
        },
      })
      .from(properties)
      .innerJoin(propertyOptions, eq(propertyOptions.propertyId, properties.id))
      .where(
        and(
          or(isNull(properties.projectId), eq(properties.projectId, project.id)),
          or(isNull(propertyOptions.projectId), eq(propertyOptions.projectId, project.id)),
        ),
      )
      .orderBy(asc(properties.createdAt), asc(properties.id), asc(propertyOptions.position));
    const adaptations = await db
      .select({
        propertyId: projectProperties.propertyId,
        hidden: projectProperties.hidden,
        ownOptions: projectProperties.ownOptions,
      })
      .from(projectProperties)
      .where(eq(projectProperties.projectId, project.id));
    const byId = new Map<string, Row & { projectId: string | null }>();
    for (const { property, option } of rows) {
      const adaptation = adaptations.find(({ propertyId }) => propertyId === property.id);
      // The instance's options, or the project's own where it has them, never both.
      const ownOptions = property.projectId === null && Boolean(adaptation?.ownOptions);
      if ((option.projectId !== null) !== ownOptions) {
        continue;
      }
      const row = byId.get(property.id) ?? { ...property, options: [] };
      row.options.push({
        id: option.id,
        name: option.name,
        color: option.color,
        issueCount: option.issueCount,
      });
      byId.set(property.id, row);
    }
    const all = [...byId.values()];
    return {
      fields: {
        category: { hidden: fields.categoryHidden, required: fields.categoryRequired },
        priority: { hidden: fields.priorityHidden, required: fields.priorityRequired },
      },
      instance: all
        .filter(({ projectId }) => projectId === null)
        .map(({ projectId: _, ...row }) => {
          const adaptation = adaptations.find(({ propertyId }) => propertyId === row.id);
          return {
            ...row,
            hidden: adaptation?.hidden ?? false,
            ownOptions: adaptation?.ownOptions ?? false,
          };
        }),
      own: all.filter(({ projectId }) => projectId !== null).map(({ projectId: _, ...row }) => row),
    };
  },
});
