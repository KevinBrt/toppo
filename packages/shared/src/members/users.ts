import { z } from 'zod';
import { roleBadgeSchema } from './roles.ts';

export const userIdParamsSchema = z.object({
  userId: z.uuid(),
});

/** Someone an issue names: `name` is `null` once their account is deleted. */
export const userRefSchema = z.object({ id: z.uuid(), name: z.string().nullable() });

export type UserRef = z.infer<typeof userRefSchema>;

export const userSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  /** The member's own role. */
  role: roleBadgeSchema,
  /** UTC ISO 8601 date of deactivation, or `null` while the account is active. */
  deactivatedAt: z.iso.datetime().nullable(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;

/** Body of `GET /api/v1/users/roles`: the roles users can be given, in creation order. */
export const assignableRolesResponseSchema = z.object({
  roles: z.array(roleBadgeSchema),
});

export type AssignableRolesResponse = z.infer<typeof assignableRolesResponseSchema>;

/** Body of `PATCH /api/v1/users/:userId`: the member's new role. */
export const changeUserRoleRequestSchema = z.object({
  roleId: z.uuid(),
});

export type ChangeUserRoleRequest = z.infer<typeof changeUserRoleRequestSchema>;
