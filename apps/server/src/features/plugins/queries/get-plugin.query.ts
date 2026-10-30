import { schema } from '@toppo-tracker/db';
import { type Manifest, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import {
  PLUGIN_HTTP_CALLS_KEPT,
  PLUGIN_PROJECTS_MAX,
  type PluginDetailsResponse,
  pluginSlugParamsSchema,
} from '@toppo-tracker/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { translated } from '../../../platform/plugins/plugin-words.ts';
import { lastFailureOf } from '../models/plugin-failure.model.ts';
import { identityOf, PLUGIN_IDENTITY, pluginNotFound } from '../utils/plugin-rows.util.ts';
import { savedValuesOf, settingFieldsOf } from '../utils/settings/plugin-settings.util.ts';

const { pluginHttpCalls, pluginProjectSettings, pluginProjects, plugins, projects, users } = schema;

/** `null` once their account is deleted. */
const approverName = sql<
  string | null
>`case when ${users.deletedAt} is null then ${users.name} end`;

/** A plugin, with what its code declares, where it was approved to act, and its settings. */
export const getPlugin = defineQuery({
  name: 'plugin.get',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ db, services }, { pluginSlug }): Promise<PluginDetailsResponse> {
    const [plugin] = await db
      .select({
        ...PLUGIN_IDENTITY,
        id: plugins.id,
        version: plugins.version,
        state: plugins.state,
        manifest: plugins.manifest,
        packageSha256: plugins.packageSha256,
        allProjects: plugins.allProjects,
        privateHosts: plugins.privateHosts,
        settings: plugins.settings,
        settingsRefused: plugins.settingsRefused,
        approvedAt: plugins.approvedAt,
        approvedById: users.id,
        approvedByName: approverName,
        failures: plugins.failures,
        lastError: plugins.lastError,
        createdAt: plugins.createdAt,
        updatedAt: plugins.updatedAt,
      })
      .from(plugins)
      .leftJoin(users, eq(users.id, plugins.approvedById))
      .where(eq(plugins.slug, pluginSlug));
    if (!plugin) {
      throw pluginNotFound();
    }
    const chosen = await db
      .select({ id: projects.id, key: projects.key, name: projects.name })
      .from(pluginProjects)
      .innerJoin(projects, eq(projects.id, pluginProjects.projectId))
      .where(eq(pluginProjects.pluginId, plugin.id))
      .orderBy(asc(projects.key))
      .limit(PLUGIN_PROJECTS_MAX);
    const refusedProjects = await db
      .select({ key: projects.key, name: projects.name })
      .from(pluginProjectSettings)
      .innerJoin(projects, eq(projects.id, pluginProjectSettings.projectId))
      .where(
        and(eq(pluginProjectSettings.pluginId, plugin.id), eq(pluginProjectSettings.refused, true)),
      )
      .orderBy(asc(projects.key))
      .limit(PLUGIN_PROJECTS_MAX);
    const httpCalls = await db
      .select({
        id: pluginHttpCalls.id,
        method: pluginHttpCalls.method,
        host: pluginHttpCalls.host,
        status: pluginHttpCalls.status,
        error: pluginHttpCalls.error,
        durationMs: pluginHttpCalls.durationMs,
        at: pluginHttpCalls.createdAt,
      })
      .from(pluginHttpCalls)
      .where(eq(pluginHttpCalls.pluginId, plugin.id))
      .orderBy(desc(pluginHttpCalls.createdAt), desc(pluginHttpCalls.id))
      .limit(PLUGIN_HTTP_CALLS_KEPT);
    // Checked as it was installed: a manifest Toppo kept is one it accepted.
    const manifest = manifestSchema.parse(plugin.manifest);
    return {
      slug: plugin.slug,
      ...identityOf(plugin),
      version: plugin.version,
      state: plugin.state,
      packageSha256: plugin.sha256,
      apiVersion: manifest.apiVersion,
      needs: manifest.needs,
      permissions: Object.entries(manifest.permissions).map(([name, { scope, label }]) => ({
        name,
        scope,
        label: translated(manifest.messages, label, name),
      })),
      properties: Object.entries(manifest.properties).map(
        ([name, { name: label, type, writtenBy, display }]) => ({
          name: translated(manifest.messages, label, name),
          type,
          writtenBy,
          display: display ?? null,
        }),
      ),
      events: manifest.events,
      actions: manifest.actions.map((action) => action.name),
      jobs: manifest.jobs.map(({ name, every, label }) => ({
        name,
        every,
        label: translated(manifest.messages, label, name),
      })),
      http: httpOf(manifest),
      privateHosts: plugin.privateHosts,
      httpCalls: httpCalls.map(({ at, ...call }) => ({ ...call, at: at.toISOString() })),
      routes: manifest.routes.map(({ name }) => ({
        name,
        url: new URL(
          `/api/v1/plugins/${encodeURIComponent(pluginSlug)}/routes/${name}`,
          services.publicUrl,
        ).href,
      })),
      allProjects: plugin.allProjects,
      projects: chosen,
      approval:
        plugin.approvedAt === null
          ? null
          : {
              by:
                plugin.approvedById === null
                  ? null
                  : { id: plugin.approvedById, name: plugin.approvedByName },
              at: plugin.approvedAt.toISOString(),
            },
      failures: plugin.failures,
      lastFailure: lastFailureOf(plugin.lastError),
      settings: {
        fields: settingFieldsOf(manifest, 'settings', plugin.settings),
        values: savedValuesOf(manifest, 'settings', plugin.settings),
        refused: plugin.settingsRefused,
        refusedProjects,
      },
      createdAt: plugin.createdAt.toISOString(),
      updatedAt: plugin.updatedAt.toISOString(),
    };
  },
});

/** Where it may send requests, its settings named by their labels. */
function httpOf({ http, messages }: Manifest): PluginDetailsResponse['http'] {
  if (http === null || http === 'any') {
    return http === null ? null : { kind: 'any' };
  }
  return Array.isArray(http)
    ? { kind: 'hosts', hosts: http }
    : {
        kind: 'settings',
        settings: http.fromSettings.map((name) =>
          translated(messages, `settings.${name}.label`, name),
        ),
      };
}
