import { PLUGIN_STATES, type PluginState } from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth.ts';
import { id, timestamps } from '../columns.ts';
import { projects } from '../projects.ts';

/** Bytes as PostgreSQL keeps them, which the driver reads as a `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * A plugin installed by an administrator: the package uploaded, what its code declared, and what
 * was approved of it. Its zip is kept in the data volume, under its SHA-256.
 */
export const plugins = pgTable(
  'plugins',
  {
    id: id(),
    /**
     * The id its manifest declares, `time-tracking`: in its URLs and its permissions' names. Mirrors
     * PLUGIN_ID (`@toppo-tracker/plugin-sdk/protocol`).
     */
    slug: text('slug').notNull(),
    /** As its package says: `1.2.0`. */
    version: text('version').notNull(),
    state: text('state', { enum: PLUGIN_STATES }).$type<PluginState>().notNull().default('pending'),
    /**
     * What its code declared when it was uploaded, as the sandbox answered it and Toppo checked it
     * (`manifestSchema`): what an administrator approves, and what Toppo enforces.
     */
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    /** SHA-256 of the zip uploaded, hex-encoded: shown to the administrator, checked on loading. */
    packageSha256: text('package_sha256').notNull(),
    /** It acts in every project, present and future; otherwise in `plugin_projects` only. */
    allProjects: boolean('all_projects').notNull().default(false),
    /** As the administrator saved them; the secrets among them sealed with the instance key. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Its runs that failed in a row: past a few, it is stopped and the administrators told. */
    failures: integer('failures').notNull().default(0),
    lastError: text('last_error'),
    /**
     * Its logo, from its package, checked by its bytes: small enough to keep beside it here, and
     * gone with it. Mirrors PLUGIN_LOGO_TYPES (`@toppo-tracker/plugin-sdk/protocol`).
     */
    logo: bytea('logo'),
    logoType: text('logo_type'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('plugins_slug_unique').on(table.slug),
    index('plugins_approved_by_id_idx').on(table.approvedById),
    check('plugins_slug_format', sql`${table.slug} ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'`),
    // Mirrors PLUGIN_VERSION (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugins_version_format',
      sql`${table.version} ~ '^[0-9]{1,4}[.][0-9]{1,4}[.][0-9]{1,4}(-[0-9A-Za-z.-]{1,40})?$'`,
    ),
    // Mirrors PLUGIN_STATES (`@toppo-tracker/shared`).
    check('plugins_state_check', sql`${table.state} in ('pending', 'enabled', 'disabled')`),
    check('plugins_package_sha256_format', sql`${table.packageSha256} ~ '^[0-9a-f]{64}$'`),
    check('plugins_failures_not_negative', sql`${table.failures} >= 0`),
    check('plugins_last_error_length', sql`char_length(${table.lastError}) <= 2000`),
    check('plugins_logo_whole', sql`(${table.logo} is null) = (${table.logoType} is null)`),
    check('plugins_logo_type', sql`${table.logoType} in ('image/png', 'image/webp')`),
    check('plugins_logo_size', sql`octet_length(${table.logo}) <= 262144`),
    // Running takes an administrator's approval, whoever gave it.
    check(
      'plugins_enabled_are_approved',
      sql`${table.state} <> 'enabled' or ${table.approvedAt} is not null`,
    ),
  ],
);

/** The projects a plugin acts in, unless it acts in all of them. */
export const pluginProjects = pgTable(
  'plugin_projects',
  {
    id: id(),
    pluginId: uuid('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('plugin_projects_plugin_project_unique').on(table.pluginId, table.projectId),
    index('plugin_projects_project_id_idx').on(table.projectId),
  ],
);
