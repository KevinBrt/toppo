import type { Locale, RoleColor } from '@toppo-tracker/shared';
import type { Permission } from './catalog.ts';

/** The three profiles a fresh instance offers. */
export type DefaultRoleKind = 'administrator' | 'team' | 'requester';

export interface RoleDefinition {
  id: string;
  kind: DefaultRoleKind;
  /** English name, as seeded by the migrations. */
  name: string;
  /** The system role: every permission, now and to come; it cannot be edited or deleted. */
  grantsAll: boolean;
  color: RoleColor;
  /** Stored permissions; ignored when the role grants everything. */
  permissions: readonly Permission[];
  /** Its members are told of every new issue they may see. */
  notifyNewIssues: boolean;
}

/**
 * Names of the default roles per language. The first-run wizard writes them in the
 * administrator's language; afterwards they are ordinary data the administrator can rename.
 */
export const DEFAULT_ROLE_NAMES: Readonly<
  Record<Locale, Readonly<Record<DefaultRoleKind, string>>>
> = {
  en: { administrator: 'Administrator', team: 'Team', requester: 'Requester' },
  fr: { administrator: 'Administrateur', team: 'Équipe', requester: 'Demandeur' },
};

/** Stable ids of the seeded roles, for the first-run wizard and the tests. */
export const DEFAULT_ROLE_IDS = {
  administrator: '01a1569b-9800-7e64-8269-eb18fddc30ee',
  team: '01a1569b-9801-747e-91c9-d058653f2a8e',
  requester: '01a1569b-9802-7f0a-b82f-656d1e2109c6',
} as const;

/**
 * The roles a fresh instance starts with. Mirrors the seed of the migrations (checked by tests).
 * A member's role applies in the whole instance and in every project they reach; a project may
 * give a member another role.
 * - Administrator: everything, locked.
 * - Team: the people who work on issues (developers, support…); they see every issue of a project.
 *   Projects are set up by administrators.
 * - Requester: people outside the team (customers, other departments); they see their own issues only.
 */
export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    id: DEFAULT_ROLE_IDS.administrator,
    kind: 'administrator',
    name: DEFAULT_ROLE_NAMES.en.administrator,
    grantsAll: true,
    color: 'blue',
    permissions: [],
    notifyNewIssues: true,
  },
  {
    id: DEFAULT_ROLE_IDS.team,
    kind: 'team',
    name: DEFAULT_ROLE_NAMES.en.team,
    grantsAll: false,
    color: 'green',
    permissions: [
      'issue.read',
      'issue.read.own',
      'issue.create',
      'issue.update',
      'issue.assign',
      'comment.create',
    ],
    notifyNewIssues: true,
  },
  {
    id: DEFAULT_ROLE_IDS.requester,
    kind: 'requester',
    name: DEFAULT_ROLE_NAMES.en.requester,
    grantsAll: false,
    color: 'gray',
    permissions: ['issue.read.own', 'issue.create', 'comment.create'],
    notifyNewIssues: false,
  },
];
