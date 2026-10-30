import { z } from 'zod';
import { PALETTE_COLORS, type PaletteColor } from '../colors.ts';

/** Colors of role badges. */
export const ROLE_COLORS = PALETTE_COLORS;

export type RoleColor = PaletteColor;

/** A role as member management shows it: a colored badge. */
export const roleBadgeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(ROLE_COLORS),
});

export type RoleBadge = z.infer<typeof roleBadgeSchema>;

/** At most this many roles: the matrix shows them side by side, and lists stay bounded. */
export const ROLES_MAX = 20;

export const ROLE_NAME_MAX_LENGTH = 40;

export const roleIdParamsSchema = z.object({
  roleId: z.uuid(),
});

/** A role as the roles and permissions matrix shows it. */
export const roleDetailsSchema = roleBadgeSchema.extend({
  /** The system role: every permission, now and to come; it cannot be changed or deleted. */
  grantsAll: z.boolean(),
  /** What the role grants, in catalog order: every permission for the system role. */
  permissions: z.array(z.string()),
  /**
   * Its members are told of every new issue of the projects where it applies: a setting, not a
   * permission, which the system role may turn off too.
   */
  notifyNewIssues: z.boolean(),
  /** Members holding it, deactivated ones included. */
  memberCount: z.number().int().nonnegative(),
  /** Pending invitations giving it, expired ones included. */
  invitationCount: z.number().int().nonnegative(),
  /** Projects giving it to some of their members. */
  projectCount: z.number().int().nonnegative(),
});

export type RoleDetails = z.infer<typeof roleDetailsSchema>;

/** A plugin installed, with the permissions it adds: a section of the matrix after Toppo's. */
export const pluginPermissionSectionSchema = z.object({
  slug: z.string(),
  /** "Time tracking", in each language. */
  name: z.object({ en: z.string(), fr: z.string() }),
  permissions: z.array(
    z.object({
      /** As the catalog names it: `time-tracking.entries.log`. */
      name: z.string(),
      scope: z.enum(['instance', 'project']),
      /** In the plugin's own words. */
      label: z.object({ en: z.string(), fr: z.string() }),
    }),
  ),
});

export type PluginPermissionSection = z.infer<typeof pluginPermissionSectionSchema>;

/** Body of `GET /api/v1/roles`: every role, in creation order, and the plugins' permissions. */
export const rolesResponseSchema = z.object({
  roles: z.array(roleDetailsSchema),
  /** By plugin id. */
  plugins: z.array(pluginPermissionSectionSchema),
});

export type RolesResponse = z.infer<typeof rolesResponseSchema>;

/** Body of `POST /api/v1/roles` and `PATCH /api/v1/roles/:roleId`. */
export const roleRequestSchema = z.object({
  name: z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH),
  color: z.enum(ROLE_COLORS),
});

export type RoleRequest = z.infer<typeof roleRequestSchema>;

export const createRoleResponseSchema = z.object({
  id: z.uuid(),
});

/**
 * What a role may hold: Toppo's permissions, and up to 30 for each of up to 50 plugins, named
 * after it (40 characters, a dot, then up to 60).
 */
const permissionListSchema = z.array(z.string().max(101)).max(1600);

/** Body of `PUT /api/v1/roles/permissions`: the roles the matrix changed, saved together. */
export const rolePermissionsRequestSchema = z.object({
  changes: z
    .array(
      z.object({
        roleId: z.uuid(),
        /** What the matrix showed: if the role changed since, nothing is saved. */
        from: permissionListSchema,
        to: permissionListSchema,
        /** Whether its members are told of new issues, before and after, if the matrix changed it. */
        notifyNewIssues: z.object({ from: z.boolean(), to: z.boolean() }).optional(),
      }),
    )
    .min(1)
    .max(ROLES_MAX)
    .refine((changes) => new Set(changes.map(({ roleId }) => roleId)).size === changes.length, {
      message: 'Each role at most once',
    }),
});

export type RolePermissionsRequest = z.infer<typeof rolePermissionsRequestSchema>;
