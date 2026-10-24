import { schema } from '@toppo/db';
import { and, eq, type SQL, sql } from 'drizzle-orm';

const { issues, properties, propertyOptions } = schema;

/**
 * Joins the issues having a value of the property a row is about, of one project or of every
 * one: found through the index of the values. Counted with `count(issues.id)`, grouped by
 * property.
 */
export function issuesWithValue(projectId?: string): SQL | undefined {
  return and(
    projectId === undefined ? undefined : eq(issues.projectId, projectId),
    sql`${issues.properties} @? ('$."' || ${properties.id}::text || '"')::jsonpath`,
  );
}

/**
 * How many issues choose the option a row is about, of one project or of every one: found
 * through the index of the values, a multi-select's option among the others. The row joins its
 * property, so that every column names its table.
 */
export function issuesChoosing(projectId?: string): SQL<number> {
  return sql<number>`(
    select count(*) from ${issues}
    where ${projectId === undefined ? sql`true` : eq(issues.projectId, projectId)}
      and ${issues.properties} @> jsonb_build_object(
        ${properties.id}::text,
        case when ${properties.type} = 'multiSelect'
          then jsonb_build_array(${propertyOptions.id}::text)
          else to_jsonb(${propertyOptions.id}::text)
        end
      )
  )`.mapWith(Number);
}
