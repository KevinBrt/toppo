import { containsText, schema } from '@toppo-tracker/db';
import {
  PICK_LIMIT,
  type PickedIssuesResponse,
  pickQuerySchema,
  pluginSlugParamsSchema,
} from '@toppo-tracker/shared';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { grantedIn } from '../../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { pickedIn, pickingPlugin } from '../../utils/pickers/picking-plugin.util.ts';

const { issues, projects } = schema;

/** `WEB-42`, `web-42`: an issue's key, typed. */
const KEY = /^([A-Za-z][A-Za-z0-9]*)-(\d{1,9})$/;

/**
 * Toppo's search of issues for a plugin's screen: those the signed-in person reads, in the
 * projects where the plugin acts (one of them, if the screen says), out of archived projects,
 * by their key or words of their title, the latest changed first. A few, never a page. The plugin
 * must read issues: it learns of the one picked.
 */
export const pickIssues = defineQuery({
  name: 'plugin.pickIssues',
  access: 'authenticated',
  input: pluginSlugParamsSchema.extend(pickQuerySchema.shape),
  async handler({ db, actor }, { pluginSlug, search, projectId }): Promise<PickedIssuesResponse> {
    const plugin = await pickingPlugin(db, pluginSlug);
    if (!plugin.manifest.needs.includes('issue.read')) {
      throw new HttpError(403, 'PLUGIN_NEED_MISSING', 'The plugin reads no issues');
    }
    const key = KEY.exec(search);
    const rows = await db
      .select({
        id: issues.id,
        number: issues.number,
        title: issues.title,
        projectId: projects.id,
        projectKey: projects.key,
      })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(
        and(
          isNull(projects.archivedAt),
          or(
            grantedIn(actor.id, ['issue.read']),
            and(grantedIn(actor.id, ['issue.read.own']), eq(issues.reporterId, actor.id)),
          ),
          pickedIn(plugin, projects.id, projectId),
          search === ''
            ? undefined
            : or(
                containsText([issues.title], search),
                key
                  ? and(
                      eq(projects.key, (key[1] ?? '').toUpperCase()),
                      eq(issues.number, Number(key[2])),
                    )
                  : undefined,
              ),
        ),
      )
      .orderBy(desc(issues.updatedAt), desc(issues.id))
      .limit(PICK_LIMIT);
    return {
      issues: rows.map(({ number, ...row }) => ({ ...row, key: `${row.projectKey}-${number}` })),
    };
  },
});
