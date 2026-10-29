import { formatIssueKey, priorityLevelOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  type IssuePropertyValue,
  type IssueSummary,
  type LabelRef,
  projectKeySchema,
  type UserRef,
} from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import { shownFromInstance } from '../../../platform/plugins/plugin-properties.ts';

const { issueLabels, issues, labels, projectProperties, properties, propertyOptions, users } =
  schema;

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

/** An option as values show it. */
const optionJson = sql`json_build_object(
  'id', ${propertyOptions.id},
  'name', ${propertyOptions.name},
  'color', ${propertyOptions.color}
)`;

/**
 * A value as it reads, by its property's type: options of the property in their order, someone
 * named as they are now, anything else as stored. A value not of its type's shape, or naming no
 * option (none should), reads as null and is left out rather than failing the query.
 */
const shownValue = sql`case ${properties.type}
  when 'list' then (
    select ${optionJson} from ${propertyOptions}
    where ${propertyOptions.propertyId} = ${properties.id}
      and jsonb_typeof(chosen.value) = 'string'
      and ${propertyOptions.id}::text = chosen.value #>> '{}'
  )
  when 'multiSelect' then (
    select json_agg(${optionJson} order by ${propertyOptions.position}) from ${propertyOptions}
    where ${propertyOptions.propertyId} = ${properties.id}
      and jsonb_typeof(chosen.value) = 'array'
      and chosen.value ? ${propertyOptions.id}::text
  )
  when 'user' then (
    select json_build_object(
      'id', ${users.id},
      'name', case when ${users.deletedAt} is null then ${users.name} end
    ) from ${users}
    where jsonb_typeof(chosen.value) = 'string' and ${users.id}::text = chosen.value #>> '{}'
  )
  when 'number' then case when jsonb_typeof(chosen.value) = 'number' then chosen.value::json end
  when 'checkbox' then case when chosen.value = 'true'::jsonb then chosen.value::json end
  else case when jsonb_typeof(chosen.value) = 'string' then chosen.value::json end
end`;

/**
 * The values of the properties of the issue a row is about, oldest property first, as a column
 * of the query itself: those shown in the list, or all of them, of the properties its project
 * takes (not one it hides, nor a plugin's where it no longer acts).
 */
export function propertyValuesOfIssue({ listedOnly }: { listedOnly: boolean }) {
  return sql<IssuePropertyValue[]>`coalesce((
    select json_agg(
      json_build_object(
        'id', ${properties.id},
        'name', ${properties.name},
        'type', ${properties.type},
        'display', ${properties.display},
        'value', shown.value
      )
      order by ${properties.createdAt}, ${properties.id}
    )
    from jsonb_each(${issues.properties}) as chosen(property_id, value)
    join ${properties} on ${properties.id}::text = chosen.property_id
    cross join lateral (select ${shownValue} as value) as shown
    where shown.value is not null
    and (${properties.projectId} = ${issues.projectId} or (
      ${properties.projectId} is null and ${shownFromInstance(issues.projectId)} and not exists (
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
