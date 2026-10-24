import { formatIssueKey, priorityLevelOf } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  type IssuePropertyValue,
  type IssueSummary,
  type LabelRef,
  projectKeySchema,
  type UserRef,
} from '@toppo/shared';
import { sql } from 'drizzle-orm';

const { issueLabels, issues, labels, projectProperties, properties, propertyOptions } = schema;

/**
 * The labels of the issue a row is about, by name, as a column of the query itself: read from
 * the index of `issue_labels`, a page of issues at once.
 */
export const labelsOfIssue = sql<LabelRef[]>`coalesce((
  select json_agg(
    json_build_object('id', ${labels.id}, 'name', ${labels.name}, 'color', ${labels.color})
    order by lower(${labels.name}), ${labels.id}
  )
  from ${issueLabels} join ${labels} on ${labels.id} = ${issueLabels.labelId}
  where ${issueLabels.issueId} = ${issues.id}
), '[]'::json)`;

/**
 * The values of the properties of the issue a row is about, oldest property first, as a column
 * of the query itself: those shown in the list, or all of them, of the properties its project
 * takes (not one it hides). Values are compared as text, so that one naming no option (none
 * should) is left out rather than failing the query.
 */
export function propertyValuesOfIssue({ listedOnly }: { listedOnly: boolean }) {
  return sql<IssuePropertyValue[]>`coalesce((
    select json_agg(
      json_build_object(
        'id', ${properties.id},
        'name', ${properties.name},
        'option', json_build_object(
          'id', ${propertyOptions.id},
          'name', ${propertyOptions.name},
          'color', ${propertyOptions.color}
        )
      )
      order by ${properties.createdAt}, ${properties.id}
    )
    from jsonb_each_text(${issues.properties}) as chosen(property_id, option_id)
    join ${propertyOptions} on ${propertyOptions.id}::text = chosen.option_id
      and ${propertyOptions.propertyId}::text = chosen.property_id
    join ${properties} on ${properties.id} = ${propertyOptions.propertyId}
    where (${properties.projectId} = ${issues.projectId} or (
      ${properties.projectId} is null and not exists (
        select 1 from ${projectProperties}
        where ${projectProperties.projectId} = ${issues.projectId}
          and ${projectProperties.propertyId} = ${properties.id}
          and ${projectProperties.hidden}
      )
    ))
    ${listedOnly ? sql`and ${properties.shownInList}` : sql``}
  ), '[]'::json)`;
}

/** Someone as an issue names them: an erased account keeps its id, not its name. */
export function userRefOf(user: { id: string; name: string; deletedAt: Date | null }): UserRef {
  return { id: user.id, name: user.deletedAt ? null : user.name };
}

/** The columns of an issue row the list and the page share, before they are sent. */
export interface IssueSummaryRow {
  number: number;
  title: string;
  status: IssueSummary['status'];
  category: IssueSummary['category'];
  priority: { id: string; name: string; level: number };
  assignee: { id: string; name: string; deletedAt: Date | null } | null;
  reporter: { id: string; name: string; deletedAt: Date | null };
  labels: LabelRef[];
  properties: IssuePropertyValue[];
  createdAt: Date;
  updatedAt: Date;
}

/** An issue as lists show it, known by its key. */
export function toIssueSummary(projectKey: string, row: IssueSummaryRow): IssueSummary {
  return {
    key: formatIssueKey({ projectKey: projectKeySchema.parse(projectKey), number: row.number }),
    title: row.title,
    status: row.status,
    category: row.category,
    priority: { ...row.priority, level: priorityLevelOf(row.priority.level) },
    assignee: row.assignee ? userRefOf(row.assignee) : null,
    reporter: userRefOf(row.reporter),
    labels: row.labels,
    properties: row.properties,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
