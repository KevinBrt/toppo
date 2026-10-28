import type { Db } from '@toppo-tracker/db';
import { containsText, schema } from '@toppo-tracker/db';
import {
  MEMBERS_PAGE_SIZE,
  type MemberRow,
  type MembersResponse,
  membersQuerySchema,
} from '@toppo-tracker/shared';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { invitations, roles, users } = schema;
const inviters = alias(users, 'inviters');

/**
 * Members and pending invitations as one list, with what is needed to filter and sort it. The
 * database does the searching, sorting and paging; only the page's rows are loaded in full.
 */
const entries = sql`(
  select 'member' as type, ${users.id} as id, ${users.name} as name, ${users.email} as email,
    ${roles.id} as role_id, ${roles.createdAt} as role_created_at
  from ${users} join ${roles} on ${roles.id} = ${users.instanceRoleId}
  where ${users.deletedAt} is null
  union all
  select 'invitation', ${invitations.id}, null, ${invitations.email},
    ${roles.id}, ${roles.createdAt}
  from ${invitations} join ${roles} on ${roles.id} = ${invitations.roleId}
  where ${invitations.acceptedAt} is null
) as entries`;

const where = (condition: SQL | undefined) => (condition ? sql`where ${condition}` : sql``);

/** One page of members and invitations, with the counts the screen shows. */
export const listMembers = defineQuery({
  name: 'member.list',
  access: { permission: 'instance.users.manage' },
  input: membersQuerySchema,
  async handler({ db }, { role, search, page }): Promise<MembersResponse> {
    const searched = search
      ? containsText([sql`entries.name`, sql`entries.email`], search)
      : undefined;
    const filtered = and(searched, role ? sql`entries.role_id = ${role}` : undefined);

    const pageRows = await db.execute<{ type: MemberRow['type']; id: string }>(sql`
      select entries.type, entries.id from ${entries} ${where(filtered)}
      order by entries.role_created_at, entries.role_id,
        lower(coalesce(entries.name, entries.email)), entries.id
      limit ${MEMBERS_PAGE_SIZE} offset ${(page - 1) * MEMBERS_PAGE_SIZE}`);
    const counts = await db.execute<{ role_id: string; count: string }>(sql`
      select entries.role_id, count(*) as count from ${entries} ${where(searched)}
      group by entries.role_id`);
    const [totals] = await db.execute<{ members: string; invitations: string }>(sql`
      select count(*) filter (where entries.type = 'member') as members,
        count(*) filter (where entries.type = 'invitation') as invitations
      from ${entries}`);

    const byRole = Object.fromEntries(counts.map((row) => [row.role_id, Number(row.count)]));
    const matching = role ? (byRole[role] ?? 0) : Object.values(byRole).reduce((a, b) => a + b, 0);
    return {
      rows: await loadRows(db, pageRows),
      byRole,
      matching,
      totals: {
        members: Number(totals?.members ?? 0),
        invitations: Number(totals?.invitations ?? 0),
      },
      page,
      pageSize: MEMBERS_PAGE_SIZE,
    };
  },
});

/** The page's rows in full, in the page's order. */
async function loadRows(
  db: Db,
  page: readonly { type: MemberRow['type']; id: string }[],
): Promise<MemberRow[]> {
  const idsOf = (type: MemberRow['type']) =>
    page.filter((row) => row.type === type).map((row) => row.id);
  const memberIds = idsOf('member');
  const invitationIds = idsOf('invitation');
  const role = { id: roles.id, name: roles.name, color: roles.color };

  const members =
    memberIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role,
            deactivatedAt: users.deactivatedAt,
          })
          .from(users)
          .innerJoin(roles, eq(roles.id, users.instanceRoleId))
          .where(inArray(users.id, memberIds));
  const pending =
    invitationIds.length === 0
      ? []
      : await db
          .select({
            id: invitations.id,
            email: invitations.email,
            role,
            inviterName: inviters.name,
            inviterDeletedAt: inviters.deletedAt,
            expiresAt: invitations.expiresAt,
          })
          .from(invitations)
          .innerJoin(roles, eq(roles.id, invitations.roleId))
          .innerJoin(inviters, eq(inviters.id, invitations.invitedById))
          .where(and(inArray(invitations.id, invitationIds), isNull(invitations.acceptedAt)));

  const byId = new Map<string, MemberRow>([
    ...members.map(({ deactivatedAt, ...member }): [string, MemberRow] => [
      member.id,
      { type: 'member', ...member, deactivatedAt: deactivatedAt?.toISOString() ?? null },
    ]),
    ...pending.map(
      ({ expiresAt, inviterName, inviterDeletedAt, ...invitation }): [string, MemberRow] => [
        invitation.id,
        {
          type: 'invitation',
          ...invitation,
          invitedBy: inviterDeletedAt ? null : inviterName,
          expiresAt: expiresAt.toISOString(),
        },
      ],
    ),
  ]);
  // A row removed between the two reads simply drops out of the page.
  return page.flatMap((row) => byId.get(row.id) ?? []);
}
