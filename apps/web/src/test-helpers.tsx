import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  type AttachmentPlace,
  actionsFor,
  attachmentActionsOf,
  can,
  canActOnProjectMember,
  canAttachTo,
  canGiveProjectRole,
  canMoveTo,
  canSeeIssue,
  cleanFileName,
  commentActionsOf,
  createTextScan,
  creationValuesOf,
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_ROLES,
  DEFAULT_STATUSES,
  DEFAULT_TRANSITIONS,
  effectiveProperties,
  FILE_HEAD_LENGTH,
  followersOf,
  type InstancePermission,
  instancePermissionsOf,
  invitationExpiry,
  isNewerVersion,
  issueActionsOf,
  issueChanges,
  issueVisibilityOf,
  mediaTypeOf,
  meetsCondition,
  nextStatusesOf,
  type ProjectPermission,
  type PropertyCondition,
  type PropertyProblem,
  permissionsOfRole,
  planCategories,
  planOptions,
  planWorkflow,
  projectColorFor,
  projectPermissionsOf,
  propertyChangeOf,
  propertyConditionOf,
  propertyValueOf,
  rolePermissionsFrom,
  samePropertyValue,
  withoutOptions,
  withPropertyValue,
} from '@toppo/core';
import {
  ATTACHMENTS_MAX,
  type AttachmentMediaType,
  type CurrentUser,
  categoriesRequestSchema,
  commentRequestSchema,
  createPropertyRequestSchema,
  emailNotificationsRequestSchema,
  FILE_NAME_HEADER,
  ISSUE_SEARCH_LIMIT,
  ISSUE_SORT_ORDERS,
  ISSUES_PAGE_SIZE,
  type IssueActivity,
  type IssueAttachment,
  type IssueGrouping,
  type IssuePropertyField,
  type IssuePropertyValue,
  type IssueResponse,
  type IssueSort,
  type IssueSummary,
  issueFollowingRequestSchema,
  issueLabelsRequestSchema,
  issueSearchQuerySchema,
  type LabelRef,
  type LinkedIssue,
  type Locale,
  labelsRequestSchema,
  localeSchema,
  type MailSettings,
  MEMBERS_PAGE_SIZE,
  type MemberRow,
  mailSettingsRequestSchema,
  NOTIFICATION_EVENTS,
  type Notification,
  type PaletteColor,
  type PendingInvitation,
  PROJECT_ACCESS_PAGE_SIZE,
  PROJECT_MEMBERS_PREVIEW,
  PROJECTS_PAGE_SIZE,
  type PriorityLevel,
  type ProjectAccessRow,
  type ProjectFields,
  type PropertyOptionRef,
  type PropertyValue,
  passwordResetRequestSchema,
  prioritiesRequestSchema,
  projectFieldsSchema,
  projectIssuesQuerySchema,
  propertyAdaptationRequestSchema,
  ROLES_MAX,
  type RoleBadge,
  type RoleDetails,
  type RolePermissionsRequest,
  readNotificationsRequestSchema,
  resetPasswordRequestSchema,
  rolePermissionsRequestSchema,
  type SortOrder,
  TOPPO_VERSION,
  type UserSummary,
  updatePropertyRequestSchema,
  type WorkflowMode,
  workflowRequestSchema,
} from '@toppo/shared';
import { vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { z } from 'zod';
import { createAppRouter } from './router.tsx';
import { I18nProvider } from './shared/i18n/i18n-provider.tsx';

const instancePermissionsOfRole = (roleId: string) => {
  const role = DEFAULT_ROLES.find((candidate) => candidate.id === roleId);
  return role ? instancePermissionsOf(role) : [];
};

/** The administrator who set the instance up. */
export const ADA: CurrentUser = {
  id: '01a1569b-9900-7000-8000-000000000001',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  locale: 'en',
  emailedEvents: [...NOTIFICATION_EVENTS],
  permissions: instancePermissionsOfRole(DEFAULT_ROLE_IDS.administrator),
  // The fake server works it out from its projects.
  managesProjects: false,
};

/** A team member, who manages nothing in the instance. */
export const GRACE: CurrentUser = {
  id: '01a1569b-9900-7000-8000-000000000002',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  locale: 'en',
  emailedEvents: [...NOTIFICATION_EVENTS],
  permissions: instancePermissionsOfRole(DEFAULT_ROLE_IDS.team),
  managesProjects: false,
};
export const ADA_PASSWORD = 'correct horse battery staple';
export const GOOD_SETUP_CODE = 'ABCD-EFGH-JKLM';
/** Signing in with this address answers as for a deactivated account. */
export const DEACTIVATED_EMAIL = 'former@example.com';

/** The default roles as user management shows them. */
export const ROLE_BADGES = {
  administrator: { id: DEFAULT_ROLE_IDS.administrator, name: 'Administrator', color: 'blue' },
  team: { id: DEFAULT_ROLE_IDS.team, name: 'Team', color: 'green' },
  requester: { id: DEFAULT_ROLE_IDS.requester, name: 'Requester', color: 'gray' },
} as const satisfies Record<string, UserSummary['role']>;

/** A role as the fake server keeps it; who holds it is counted from the members. */
export type FakeRole = Omit<RoleDetails, 'memberCount' | 'invitationCount' | 'projectCount'>;

/** The default roles, as a fresh instance has them. */
function defaultRoles(): FakeRole[] {
  return DEFAULT_ROLES.map(({ id, name, color, grantsAll, permissions, notifyNewIssues }) => ({
    id,
    name,
    color,
    grantsAll,
    permissions: permissionsOfRole({ grantsAll, permissions }),
    notifyNewIssues,
  }));
}

/** The roles as badges, the way member management shows them. */
const badgesOf = (state: FakeServerState): RoleBadge[] =>
  state.roles.map(({ id, name, color }) => ({ id, name, color }));

export function memberOf(user: CurrentUser, role: UserSummary['role']): UserSummary {
  return { id: user.id, name: user.name, email: user.email, role, deactivatedAt: null };
}

export interface FakeServerState {
  setupRequired: boolean;
  user: CurrentUser | null;
  /** The accounts user management sees: Ada (administrator) and Grace (team) by default. */
  users: UserSummary[];
  /** The default roles unless a test sets others. */
  roles: FakeRole[];
  invitations: PendingInvitation[];
  /** The links the fake server made, by token, and what opening them shows. */
  invitationLinks: Map<string, InvitationLinkState>;
  /** None unless a test adds some. */
  projects: FakeProject[];
  /** Members given every project, by id. */
  allProjects: Set<string>;
  /** The projects each invitation gives, by invitation id; none when absent. */
  invitationProjects: Map<string, { allProjects: boolean; projectKeys: string[] }>;
  /** None unless a test adds some. */
  issues: FakeIssue[];
  /** Each issue's history, by issue key, oldest first. */
  activities: Map<string, IssueActivity[]>;
  /** The instance's defaults unless a test sets others, in their order. */
  categories: { id: string; name: string; color: PaletteColor; isDefault: boolean }[];
  /** The instance's defaults, lowest first. */
  priorities: { id: string; name: string; level: PriorityLevel; isDefault: boolean }[];
  /** The instance's workflow, the default one unless a test sets another. */
  workflow: FakeWorkflow;
  /** The projects' own workflows, by project key: none unless customized. */
  projectWorkflows: Map<string, FakeWorkflow>;
  /** The files attached, oldest first: none unless a test adds some. */
  attachments: FakeAttachment[];
  /** The instance's labels: none unless a test adds some. */
  labels: LabelRef[];
  /** The signed-in user's notifications, the latest first: none unless a test adds some. */
  notifications: Notification[];
  /** The latest version published, as the daily check found it: none unless a test sets one. */
  latestRelease: { version: string; url: string } | null;
  /** The largest file taken, in bytes: 20 MB unless a test sets another. */
  attachmentMaxSize: number;
  /** How the instance sends email: not set up unless a test sets it. */
  mailSettings: MailSettings | null;
  /** What the mail server answers a test email: taken (`null`), or the code of a refusal. */
  mailTestRefusal: string | null;
  /** Tokens of the links to choose a new password that still work: each works once. */
  resetTokens: string[];
  /** The instance's properties then the projects' own, oldest first: none unless added. */
  properties: FakeProperty[];
  /** How projects adapt the instance's properties: none unless a test adds some. */
  propertyAdaptations: FakeAdaptation[];
}

/** A property as the fake server keeps it, with its options in their order. */
export type FakeProperty = IssuePropertyField & {
  /** The project it belongs to; none for one of the instance. */
  projectKey?: string;
};

/** How a project adapts a property of the instance: hidden, and its own options or none. */
export interface FakeAdaptation {
  projectKey: string;
  propertyId: string;
  hidden: boolean;
  options: PropertyOptionRef[] | null;
}

/**
 * A property named `name`, a list unless `overrides` says otherwise, with options named as given,
 * made up ids from `seed`.
 */
export function fakeProperty(
  seed: number,
  name: string,
  optionNames: readonly string[],
  overrides: Partial<Omit<FakeProperty, 'options'>> = {},
): FakeProperty {
  const id = (n: number) => `01a1569b-9900-7000-8000-0000000004${String(n).padStart(2, '0')}`;
  return {
    id: id(seed * 10),
    name,
    type: 'list',
    shownInList: false,
    askedAtCreation: false,
    required: false,
    options: optionNames.map((optionName, index) => ({
      id: id(seed * 10 + index + 1),
      name: optionName,
      color: 'blue',
    })),
    ...overrides,
  };
}

/** A file as the fake server keeps it: on an issue's request, or on one of its comments. */
export interface FakeAttachment {
  id: string;
  issueKey: string;
  commentId: string | null;
  fileName: string;
  mediaType: AttachmentMediaType;
  size: number;
  uploaderId: string;
  /** What it downloads as. */
  content: BlobPart;
}

/** A notification for the signed-in user: Grace assigned them WEB-1, unread, unless said otherwise. */
export function fakeNotification(
  seed: number,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id: `01a1569b-9900-7000-8000-0000000012${String(seed).padStart(2, '0')}`,
    event: 'assigned',
    status: null,
    assignee: null,
    original: null,
    actor: { id: GRACE.id, name: GRACE.name },
    issue: { key: 'WEB-1', title: 'Empty CSV export' },
    readAt: null,
    createdAt: new Date(Date.now() - seed * 60_000).toISOString(),
    ...overrides,
  };
}

/** A file of WEB-1's request, uploaded by Ada unless said otherwise. */
export function fakeAttachment(
  seed: number,
  fileName: string,
  mediaType: AttachmentMediaType,
  overrides: Partial<FakeAttachment> = {},
): FakeAttachment {
  return {
    id: `01a1569b-9900-7000-8000-0000000010${String(seed).padStart(2, '0')}`,
    issueKey: 'WEB-1',
    commentId: null,
    fileName,
    mediaType,
    size: 1200,
    uploaderId: ADA.id,
    content: 'file',
    ...overrides,
  };
}

/** The instance's workflow as the fake server keeps it: its statuses in order, and its moves. */
export interface FakeWorkflow {
  mode: WorkflowMode;
  statuses: {
    id: string;
    name: string;
    color: PaletteColor;
    closes: boolean;
    isInitial: boolean;
  }[];
  transitions: { from: string; to: string }[];
}

/** The workflow a new instance starts with. */
export function defaultWorkflow(): FakeWorkflow {
  const idOf = (kind: string) => DEFAULT_STATUSES.find((status) => status.kind === kind)?.id ?? '';
  return {
    mode: 'defined',
    statuses: DEFAULT_STATUSES.map(({ id, name, color, closes, initial }) => ({
      id,
      name,
      color,
      closes,
      isInitial: initial,
    })),
    transitions: DEFAULT_TRANSITIONS.map(({ from, to }) => ({ from: idOf(from), to: idOf(to) })),
  };
}

/** The workflow a project's issues follow: its own, else the instance's. */
function workflowOf(state: FakeServerState, projectKey: string): FakeWorkflow {
  return state.projectWorkflows.get(projectKey) ?? state.workflow;
}

/** What the workflow lets issues do, as the server's rules read it. */
function movesOf({ mode, statuses, transitions }: FakeWorkflow) {
  return {
    mode,
    statusIds: statuses.map(({ id }) => id),
    transitions: transitions.map(({ from, to }) => ({ fromStatusId: from, toStatusId: to })),
  };
}

/** An issue as the fake server keeps it, in the instance's default workflow and fields. */
export interface FakeIssue {
  projectKey: string;
  number: number;
  title: string;
  description: string;
  statusId: string;
  categoryId: string;
  priorityId: string;
  assigneeId: string | null;
  reporterId: string;
  /** None unless said otherwise. */
  labelIds: string[];
  /** The value of each property it has, as stored, by property id: none unless said otherwise. */
  properties: Record<string, PropertyValue>;
  /** Who chose to follow it (`true`) or stopped (`false`), by user id: none unless said otherwise. */
  followers: Record<string, boolean>;
  /** The key of the issue it duplicates: none unless said otherwise. */
  duplicateOfKey: string | null;
  /** UTC ISO 8601. */
  createdAt: string;
  closedAt: string | null;
}

/** The default status, category or priority of `kind`. */
export function defaultField<T extends { kind: string }>(list: readonly T[], kind: T['kind']): T {
  const found = list.find((item) => item.kind === kind);
  if (!found) {
    throw new Error(`No default ${kind}`);
  }
  return found;
}

/** An issue for the fake server: new, a request of normal priority reported by Ada, unless said otherwise. */
export function fakeIssue(
  projectKey: string,
  number: number,
  title: string,
  overrides: Partial<FakeIssue> = {},
): FakeIssue {
  return {
    projectKey,
    number,
    title,
    description: '',
    statusId: defaultField(DEFAULT_STATUSES, 'new').id,
    categoryId: defaultField(DEFAULT_CATEGORIES, 'request').id,
    priorityId: defaultField(DEFAULT_PRIORITIES, 'normal').id,
    assigneeId: null,
    reporterId: ADA.id,
    labelIds: [],
    properties: {},
    followers: {},
    duplicateOfKey: null,
    createdAt: '2026-10-22T09:14:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

/** A project as the fake server keeps it, with the members it lists and the role it gives them. */
export interface FakeProject {
  id: string;
  key: string;
  name: string;
  description: string;
  color: PaletteColor;
  archived: boolean;
  keyEditable: boolean;
  members: { userId: string; roleId: string | null }[];
  /** How it adapts the category and the priority: as they are unless said otherwise. */
  fieldSettings?: ProjectFields;
}

export interface InvitationLinkState {
  email: string;
  invitedBy: string | null;
  status: 'pending' | 'expired' | 'used';
}

let fakeProjects = 0;

/** A project for the fake server: Ada and Grace in it, with their own roles, unless said otherwise. */
export function fakeProject(
  key: string,
  name: string,
  overrides: Partial<FakeProject> = {},
): FakeProject {
  fakeProjects += 1;
  return {
    id: `01a1569b-9900-7000-8000-0000000005${String(fakeProjects % 100).padStart(2, '0')}`,
    key,
    name,
    description: '',
    color: 'blue',
    archived: false,
    keyEditable: true,
    members: [
      { userId: ADA.id, roleId: null },
      { userId: GRACE.id, roleId: null },
    ],
    ...overrides,
  };
}

/** A well-formed invitation token, distinct for each `seed`. */
export function invitationToken(seed: number): string {
  return String(seed).padStart(43, 'x');
}

export interface FakeServer {
  state: FakeServerState;
  requests: { method: string; path: string; body: unknown }[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const apiError = (status: number, code: string) => json({ error: { code, message: code } }, status);

const NO_CONTENT = () => new Response(null, { status: 204 });

/** A tiny in-memory Toppo API, answering the web app's `fetch` calls. */
export function fakeServer(initial: Partial<FakeServerState> = {}): FakeServer {
  const server: FakeServer = {
    state: {
      setupRequired: false,
      user: null,
      users: [memberOf(ADA, ROLE_BADGES.administrator), memberOf(GRACE, ROLE_BADGES.team)],
      roles: defaultRoles(),
      invitations: [],
      invitationLinks: new Map(),
      projects: [],
      allProjects: new Set(),
      invitationProjects: new Map(),
      issues: [],
      activities: new Map(),
      categories: DEFAULT_CATEGORIES.map(({ id, name, color, isDefault }) => ({
        id,
        name,
        color,
        isDefault,
      })),
      priorities: DEFAULT_PRIORITIES.map(({ id, name, level, isDefault }) => ({
        id,
        name,
        level,
        isDefault,
      })),
      workflow: defaultWorkflow(),
      projectWorkflows: new Map(),
      attachments: [],
      labels: [],
      notifications: [],
      latestRelease: null,
      attachmentMaxSize: 20 * 1024 * 1024,
      mailSettings: null,
      mailTestRefusal: null,
      resetTokens: [],
      properties: [],
      propertyAdaptations: [],
      ...initial,
    },
    requests: [],
  };
  const { state } = server;

  const routes: Record<
    string,
    (body: Record<string, unknown>, search: URLSearchParams) => Response
  > = {
    'GET /api/v1/setup': () => json({ required: state.setupRequired }),
    'GET /api/v1/attachments/limits': () =>
      asSignedIn(state) ?? json({ maxFileSize: state.attachmentMaxSize }),
    'GET /api/v1/me': () =>
      json({
        user: state.user && {
          ...state.user,
          managesProjects: state.projects.some((project) => managesProject(state, project)),
        },
      }),
    'PATCH /api/v1/me': (body) => {
      if (!state.user) {
        return apiError(401, 'UNAUTHENTICATED');
      }
      const name = String(body['name']).trim();
      state.user = { ...state.user, name };
      return NO_CONTENT();
    },
    'POST /api/auth/change-password': (body) => {
      if (!state.user) {
        return apiError(401, 'UNAUTHENTICATED');
      }
      // Better Auth's own error shape.
      return body['currentPassword'] === ADA_PASSWORD
        ? NO_CONTENT()
        : json({ code: 'INVALID_PASSWORD', message: 'Invalid password' }, 400);
    },
    'POST /api/v1/setup': (body) => {
      if (!state.setupRequired) {
        return apiError(409, 'SETUP_ALREADY_COMPLETED');
      }
      const normalize = (code: unknown) =>
        String(code)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
      if (normalize(body['setupCode']) !== normalize(GOOD_SETUP_CODE)) {
        return apiError(403, 'INVALID_SETUP_CODE');
      }
      state.setupRequired = false;
      return json({ userId: ADA.id }, 201);
    },
    'POST /api/auth/sign-in/email': (body) => {
      if (body['email'] === ADA.email && body['password'] === ADA_PASSWORD) {
        state.user = ADA;
        return json({ redirect: false, token: 'token', user: ADA });
      }
      if (body['email'] === DEACTIVATED_EMAIL) {
        return json({ code: 'ACCOUNT_DEACTIVATED', message: 'This account is deactivated' }, 403);
      }
      return json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
    },
    'GET /api/auth/password-reset': () => json({ available: state.mailSettings !== null }),
    'POST /api/auth/request-password-reset': (body) =>
      passwordResetRequestSchema.safeParse(body).success
        ? NO_CONTENT()
        : apiError(400, 'VALIDATION_FAILED'),
    'POST /api/auth/reset-password': (body) => {
      const parsed = resetPasswordRequestSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(400, 'VALIDATION_FAILED');
      }
      if (!state.resetTokens.includes(parsed.data.token)) {
        return apiError(400, 'INVALID_RESET_LINK');
      }
      state.resetTokens = state.resetTokens.filter((token) => token !== parsed.data.token);
      return NO_CONTENT();
    },
    'POST /api/auth/sign-out': () => {
      state.user = null;
      return json({ success: true });
    },
    'GET /api/v1/members': (_body, search) => asUserManager(state) ?? members(state, search),
    'GET /api/v1/users/roles': () => asUserManager(state) ?? json({ roles: badgesOf(state) }),
    'GET /api/v1/categories': () =>
      asHolder(state, 'instance.settings.manage') ??
      json({
        categories: state.categories.map((category) => ({
          ...category,
          issueCount: state.issues.filter(({ categoryId }) => categoryId === category.id).length,
        })),
      }),
    'PUT /api/v1/categories': (body) =>
      asHolder(state, 'instance.settings.manage') ?? saveCategories(state, body),
    'GET /api/v1/notifications': (_body, search) => {
      const page = Number(search.get('page') ?? '1');
      return (
        asSignedIn(state) ??
        json({
          rows: state.notifications.slice((page - 1) * 20, page * 20),
          matching: state.notifications.length,
          page,
          pageSize: 20,
        })
      );
    },
    'GET /api/v1/instance/version': () =>
      asSignedIn(state) ??
      json({
        version: TOPPO_VERSION,
        update:
          state.latestRelease &&
          can(state.user?.permissions ?? [], 'instance.settings.manage') &&
          isNewerVersion(state.latestRelease.version, TOPPO_VERSION)
            ? state.latestRelease
            : null,
      }),
    'GET /api/v1/notifications/unread-count': () =>
      asSignedIn(state) ??
      json({ count: state.notifications.filter(({ readAt }) => readAt === null).length }),
    'POST /api/v1/notifications/read': (body) => {
      const request = readNotificationsRequestSchema.safeParse(body);
      if (!request.success) {
        return apiError(400, 'VALIDATION_FAILED');
      }
      const now = new Date().toISOString();
      for (const notification of state.notifications) {
        if ('all' in request.data || request.data.ids.includes(notification.id)) {
          notification.readAt ??= now;
        }
      }
      return asSignedIn(state) ?? NO_CONTENT();
    },
    'GET /api/v1/labels': () =>
      asHolder(state, 'instance.settings.manage') ??
      json({
        labels: byLabelName(state.labels).map((label) => ({
          ...label,
          issueCount: state.issues.filter(({ labelIds }) => labelIds.includes(label.id)).length,
        })),
      }),
    'PUT /api/v1/labels': (body) =>
      asHolder(state, 'instance.settings.manage') ?? saveLabels(state, body),
    'GET /api/v1/priorities': () =>
      asHolder(state, 'instance.settings.manage') ?? json({ priorities: state.priorities }),
    'PUT /api/v1/priorities': (body) =>
      asHolder(state, 'instance.settings.manage') ?? savePriorities(state, body),
    'GET /api/v1/workflow': () =>
      asHolder(state, 'instance.settings.manage') ??
      json({
        ...state.workflow,
        statuses: state.workflow.statuses.map((status) => ({
          ...status,
          issueCount: state.issues.filter(
            ({ projectKey, statusId }) =>
              statusId === status.id && !state.projectWorkflows.has(projectKey),
          ).length,
        })),
      }),
    'PUT /api/v1/workflow': (body) =>
      asHolder(state, 'instance.settings.manage') ??
      saved(
        changeWorkflow(state, state.workflow, body, ({ projectKey }) => {
          return !state.projectWorkflows.has(projectKey);
        }),
        (workflow) => {
          state.workflow = workflow;
        },
      ),
    'GET /api/v1/roles': () => asHolder(state, 'instance.roles.manage') ?? listRoles(state),
    'POST /api/v1/roles': (body) =>
      asHolder(state, 'instance.roles.manage') ?? createRole(state, body),
    'PUT /api/v1/roles/permissions': (body) =>
      asHolder(state, 'instance.roles.manage') ?? savePermissions(state, body),
    'POST /api/v1/invitations': (body) => asUserManager(state) ?? invite(state, body),
    'GET /api/v1/settings/email': () =>
      asHolder(state, 'instance.mail.manage') ?? json({ settings: state.mailSettings }),
    'PUT /api/v1/settings/email': (body) =>
      asHolder(state, 'instance.mail.manage') ?? saveMailSettings(state, body),
    'DELETE /api/v1/settings/email': () => {
      const refusal = asHolder(state, 'instance.mail.manage');
      if (!refusal) {
        state.mailSettings = null;
      }
      return refusal ?? NO_CONTENT();
    },
    'POST /api/v1/settings/email/test': () => {
      if (!state.mailSettings) {
        return asHolder(state, 'instance.mail.manage') ?? apiError(409, 'MAIL_NOT_CONFIGURED');
      }
      const refusal = state.mailTestRefusal;
      return (
        asHolder(state, 'instance.mail.manage') ?? (refusal ? apiError(422, refusal) : NO_CONTENT())
      );
    },
    'PUT /api/v1/me/email-notifications': (body) => {
      const parsed = emailNotificationsRequestSchema.safeParse(body);
      if (state.user && parsed.success) {
        state.user = {
          ...state.user,
          emailedEvents: NOTIFICATION_EVENTS.filter((event) => parsed.data.emailed.includes(event)),
        };
      }
      return (
        asSignedIn(state) ?? (parsed.success ? NO_CONTENT() : apiError(400, 'VALIDATION_FAILED'))
      );
    },
    'PUT /api/v1/me/locale': (body) => {
      const locale = localeSchema.safeParse(body['locale']);
      if (state.user && locale.success) {
        state.user = { ...state.user, locale: locale.data };
      }
      return (
        asSignedIn(state) ?? (locale.success ? NO_CONTENT() : apiError(400, 'VALIDATION_FAILED'))
      );
    },
    'GET /api/v1/projects': (_body, search) => asSignedIn(state) ?? listProjects(state, search),
    'GET /api/v1/issues/assigned': (_body, search) =>
      asSignedIn(state) ?? listAssignedIssues(state, search),
    'GET /api/v1/issues/search': (_body, search) =>
      asSignedIn(state) ?? searchIssues(state, search),
    'POST /api/v1/projects': (body) =>
      asHolder(state, 'project.create') ?? createProject(state, body),
    'POST /api/v1/invitations/preview': (body) => {
      const link = state.invitationLinks.get(String(body['token']));
      return link?.status === 'pending'
        ? json({ email: link.email, invitedBy: link.invitedBy })
        : linkRefusal(link);
    },
    'POST /api/v1/invitations/accept': (body) => {
      const link = state.invitationLinks.get(String(body['token']));
      if (link?.status !== 'pending') {
        return linkRefusal(link);
      }
      link.status = 'used';
      return json({ email: link.email }, 201);
    },
  };

  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin,
    );
    const method = init?.method ?? 'GET';
    const body = requestBody(init);
    requestTime = new Date().toISOString();
    server.requests.push({ method, path: url.pathname + url.search, body });
    const handler = routes[`${method} ${url.pathname}`];
    const answer = handler
      ? handler((body ?? {}) as Record<string, unknown>, url.searchParams)
      : (attachmentRequest(state, method, url.pathname, body, new Headers(init?.headers)) ??
        projectRequest(state, method, url.pathname, url.searchParams, body) ??
        issueRequest(state, method, url.pathname, url.searchParams, body) ??
        userProjects(state, method, url.pathname, url.searchParams, body) ??
        changeUser(state, method, url.pathname, body) ??
        changeInvitation(state, method, url.pathname) ??
        changeRoleDefinition(state, method, url.pathname, body) ??
        propertyRequest(state, method, url.pathname, body) ??
        apiError(404, 'NOT_FOUND'));
    return await Promise.resolve(answer);
  });

  return server;
}

/** What a request sends: a file as it is, anything else as JSON. */
function requestBody(init: RequestInit | undefined): unknown {
  if (init?.body instanceof Blob) {
    return init.body;
  }
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

/** The answer a caller without `permission` gets, or `undefined` to go on. */
function asHolder(state: FakeServerState, permission: InstancePermission): Response | undefined {
  if (!state.user) {
    return apiError(401, 'UNAUTHENTICATED');
  }
  return can(state.user.permissions, permission) ? undefined : apiError(403, 'FORBIDDEN');
}

const asUserManager = (state: FakeServerState) => asHolder(state, 'instance.users.manage');

/** `PATCH /api/v1/users/:id`, `POST …/deactivate` and `POST …/reactivate`, with the server's rules. */
function changeUser(
  state: FakeServerState,
  method: string,
  path: string,
  body: unknown,
): Response | undefined {
  const match = /^\/api\/v1\/users\/([^/]+)(?:\/(deactivate|reactivate))?$/.exec(path);
  const actions: Record<string, string | undefined> = {
    PATCH: 'changeRole',
    DELETE: 'delete',
    POST: match?.[2],
  };
  const action = match?.[2] && method !== 'POST' ? undefined : actions[method];
  if (!(match && action)) {
    return undefined;
  }
  const refusal = asUserManager(state);
  const user = state.users.find((candidate) => candidate.id === match[1]);
  if (refusal || !user) {
    return refusal ?? apiError(404, 'USER_NOT_FOUND');
  }
  if (action === 'changeRole') {
    return changeRole(state, user, (body as { roleId?: string } | undefined)?.roleId);
  }
  if (user.id === state.user?.id && action !== 'reactivate') {
    return apiError(409, action === 'delete' ? 'CANNOT_DELETE_SELF' : 'CANNOT_DEACTIVATE_SELF');
  }
  if (action === 'delete') {
    state.users = state.users.filter((candidate) => candidate !== user);
    return NO_CONTENT();
  }
  user.deactivatedAt = action === 'deactivate' ? '2026-10-21T08:30:00.000Z' : null;
  return NO_CONTENT();
}

function changeRole(state: FakeServerState, user: UserSummary, roleId?: string): Response {
  const role = badgesOf(state).find((candidate) => candidate.id === roleId);
  if (!role) {
    return apiError(400, 'INVALID_ROLE');
  }
  const otherAdministrators = state.users.filter(
    (other) =>
      other.id !== user.id &&
      other.deactivatedAt === null &&
      other.role.id === DEFAULT_ROLE_IDS.administrator,
  );
  if (role.id !== DEFAULT_ROLE_IDS.administrator && otherAdministrators.length === 0) {
    return apiError(409, 'LAST_ADMINISTRATOR');
  }
  user.role = role;
  return NO_CONTENT();
}

/** Renders the whole app at `path`, against whatever `fakeServer()` was set up. */
export async function renderApp({
  path = '/issues',
  locale = 'en',
}: {
  path?: string;
  locale?: Locale;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const screen = await render(
    <I18nProvider locale={locale}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { screen, router };
}

function linkRefusal(link: InvitationLinkState | undefined): Response {
  return link?.status === 'expired'
    ? apiError(410, 'INVITATION_EXPIRED')
    : apiError(404, 'INVITATION_INVALID');
}

function newLink(state: FakeServerState, email: string): string {
  const token = invitationToken(state.invitationLinks.size + 1);
  state.invitationLinks.set(token, { email, invitedBy: state.user?.name ?? '', status: 'pending' });
  return `http://localhost:3000/invitation#${token}`;
}

/** `PUT /api/v1/settings/email`: a password left out keeps the one saved, for the same account. */
function saveMailSettings(state: FakeServerState, body: Record<string, unknown>): Response {
  const parsed = mailSettingsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const { username, password, ...settings } = parsed.data;
  const signsIn = Boolean(username);
  const saved = state.mailSettings;
  const sameAccount =
    saved?.host === settings.host &&
    saved.port === settings.port &&
    saved.security === settings.security &&
    saved.username === username;
  if (signsIn && password === undefined && !(sameAccount && saved.passwordSet)) {
    return apiError(400, 'MAIL_PASSWORD_REQUIRED');
  }
  state.mailSettings = { ...settings, username: username || null, passwordSet: signsIn };
  return NO_CONTENT();
}

/** `POST /api/v1/invitations`: inviting an address again replaces its invitation. */
function invite(state: FakeServerState, body: Record<string, unknown>): Response {
  const emails = (body['emails'] as string[] | undefined) ?? [];
  const role = badgesOf(state).find((candidate) => candidate.id === body['roleId']);
  if (!role) {
    return apiError(400, 'INVALID_ROLE');
  }
  const alreadyMembers = emails.filter((email) => state.users.some((user) => user.email === email));
  const invited = emails.filter((email) => !alreadyMembers.includes(email));
  state.invitations = state.invitations.filter((invitation) => !invited.includes(invitation.email));
  const links = invited.map((email, index) => {
    const id = `01a1569b-9900-7000-8000-0000000002${String(state.invitationLinks.size + index).padStart(2, '0')}`;
    state.invitations.push({
      id,
      email,
      role,
      invitedBy: state.user?.name ?? '',
      // As on the server: from when it is made, never a fixed day that one morning lies behind us.
      expiresAt: invitationExpiry(new Date(requestTime)).toISOString(),
    });
    state.invitationProjects.set(id, {
      allProjects: body['allProjects'] === true,
      projectKeys: (body['projectKeys'] as string[] | undefined) ?? [],
    });
    return { id, email, link: newLink(state, email), emailed: state.mailSettings !== null };
  });
  return json({ invitations: links, alreadyMembers }, 201);
}

/** `POST /api/v1/invitations/:id/renew` and `DELETE /api/v1/invitations/:id`. */
function changeInvitation(
  state: FakeServerState,
  method: string,
  path: string,
): Response | undefined {
  const match = /^\/api\/v1\/invitations\/([^/]+?)(\/renew)?$/.exec(path);
  if (!match || (method === 'POST') !== Boolean(match[2]) || !['POST', 'DELETE'].includes(method)) {
    return undefined;
  }
  const refusal = asUserManager(state);
  const invitation = state.invitations.find((candidate) => candidate.id === match[1]);
  if (refusal || !invitation) {
    return refusal ?? apiError(404, 'INVITATION_NOT_FOUND');
  }
  if (method === 'DELETE') {
    state.invitations = state.invitations.filter((candidate) => candidate !== invitation);
    return NO_CONTENT();
  }
  return json({
    id: invitation.id,
    email: invitation.email,
    link: newLink(state, invitation.email),
    emailed: state.mailSettings !== null,
  });
}

/** Lower case without accents, as the server compares. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** `GET /api/v1/members`: searches, filters, sorts and pages like the server. */
function members(state: FakeServerState, search: URLSearchParams): Response {
  const role = search.get('role');
  const needle = fold(search.get('search') ?? '');
  const page = Number(search.get('page') ?? '1');
  const label = (row: MemberRow) => (row.type === 'member' ? row.name : row.email);
  const rank = (row: MemberRow) => state.roles.findIndex(({ id }) => id === row.role.id);
  const rows: MemberRow[] = [
    ...state.users.map((user): MemberRow => ({ type: 'member', ...user })),
    ...state.invitations.map((invitation): MemberRow => ({ type: 'invitation', ...invitation })),
  ]
    .filter((row) => [label(row), row.email].some((text) => fold(text).includes(needle)))
    .sort(
      (left, right) =>
        rank(left) - rank(right) ||
        label(left).localeCompare(label(right), undefined, { sensitivity: 'base' }),
    );
  const byRole: Record<string, number> = {};
  for (const row of rows) {
    byRole[row.role.id] = (byRole[row.role.id] ?? 0) + 1;
  }
  const matching = role ? rows.filter((row) => row.role.id === role) : rows;
  return json({
    rows: matching.slice((page - 1) * MEMBERS_PAGE_SIZE, page * MEMBERS_PAGE_SIZE),
    byRole,
    matching: matching.length,
    totals: { members: state.users.length, invitations: state.invitations.length },
    page,
    pageSize: MEMBERS_PAGE_SIZE,
  });
}

/** `GET /api/v1/roles`: who holds each role is counted from the members and invitations. */
function listRoles(state: FakeServerState): Response {
  return json({
    roles: state.roles.map((role) => ({
      ...role,
      memberCount: state.users.filter((user) => user.role.id === role.id).length,
      invitationCount: state.invitations.filter((invitation) => invitation.role.id === role.id)
        .length,
      projectCount: 0,
    })),
  });
}

const sameName = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/** `POST /api/v1/roles`: a role without permissions, under a name no other role has. */
function createRole(state: FakeServerState, body: Record<string, unknown>): Response {
  const name = String(body['name'] ?? '').trim();
  if (state.roles.some((role) => sameName(role.name, name))) {
    return apiError(409, 'ROLE_NAME_TAKEN');
  }
  if (state.roles.length >= ROLES_MAX) {
    return apiError(409, 'ROLE_LIMIT_REACHED');
  }
  const id = `01a1569b-9900-7000-8000-0000000003${String(state.roles.length).padStart(2, '0')}`;
  state.roles.push({
    id,
    name,
    color: body['color'] as FakeRole['color'],
    grantsAll: false,
    permissions: [],
    notifyNewIssues: false,
  });
  return json({ id }, 201);
}

/** `PUT /api/v1/roles/permissions`: every change or none, refused if a role changed meanwhile. */
function savePermissions(state: FakeServerState, body: Record<string, unknown>): Response {
  const parsed = rolePermissionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  for (const change of parsed.data.changes) {
    const refusal = permissionsRefusal(
      state.roles.find((candidate) => candidate.id === change.roleId),
      change,
    );
    if (refusal) {
      return refusal;
    }
  }
  for (const { roleId, to, notifyNewIssues } of parsed.data.changes) {
    const role = state.roles.find((candidate) => candidate.id === roleId);
    if (role && !role.grantsAll) {
      role.permissions = rolePermissionsFrom(to).permissions;
    }
    if (role && notifyNewIssues) {
      role.notifyNewIssues = notifyNewIssues.to;
    }
  }
  return NO_CONTENT();
}

/** Why a change of the matrix cannot apply to `role`, as the server says it, if it cannot. */
function permissionsRefusal(
  role: FakeRole | undefined,
  { from, to, notifyNewIssues }: RolePermissionsRequest['changes'][number],
): Response | null {
  const sameSet = (left: readonly string[], right: readonly string[]) =>
    [...left].sort().join() === [...right].sort().join();
  if (!role) {
    return apiError(404, 'ROLE_NOT_FOUND');
  }
  if (role.grantsAll && !sameSet(from, to)) {
    return apiError(403, 'SYSTEM_ROLE_LOCKED');
  }
  if (!role.grantsAll && rolePermissionsFrom(to).refused.length > 0) {
    return apiError(400, 'INVALID_PERMISSIONS');
  }
  const changed = notifyNewIssues !== undefined && notifyNewIssues.from !== role.notifyNewIssues;
  return !sameSet(from, role.permissions) || changed ? apiError(409, 'ROLES_CHANGED') : null;
}

/** `PATCH /api/v1/roles/:id` and `DELETE /api/v1/roles/:id`. */
function changeRoleDefinition(
  state: FakeServerState,
  method: string,
  path: string,
  body: unknown,
): Response | undefined {
  const match = /^\/api\/v1\/roles\/([^/]+)$/.exec(path);
  if (!(match && ['PATCH', 'DELETE'].includes(method))) {
    return undefined;
  }
  const refusal = asHolder(state, 'instance.roles.manage');
  const role = state.roles.find((candidate) => candidate.id === match[1]);
  if (refusal || !role) {
    return refusal ?? apiError(404, 'ROLE_NOT_FOUND');
  }
  if (role.grantsAll) {
    return apiError(403, 'SYSTEM_ROLE_LOCKED');
  }
  if (method === 'DELETE') {
    const held =
      state.users.some((user) => user.role.id === role.id) ||
      state.invitations.some((invitation) => invitation.role.id === role.id);
    if (held) {
      return apiError(409, 'ROLE_IN_USE');
    }
    state.roles = state.roles.filter((candidate) => candidate !== role);
    return NO_CONTENT();
  }
  const { name, color } = body as { name: string; color: FakeRole['color'] };
  if (state.roles.some((other) => other !== role && sameName(other.name, name.trim()))) {
    return apiError(409, 'ROLE_NAME_TAKEN');
  }
  Object.assign(role, { name: name.trim(), color });
  return NO_CONTENT();
}

/** The answer an anonymous caller gets, or `undefined` to go on. */
function asSignedIn(state: FakeServerState): Response | undefined {
  return state.user ? undefined : apiError(401, 'UNAUTHENTICATED');
}

/** What the signed-in user may do in `project`, or `null` out of their reach, as the server says. */
function projectPermissionsFor(
  state: FakeServerState,
  project: FakeProject,
): ProjectPermission[] | null {
  const user = state.user;
  if (!user) {
    return null;
  }
  const roleOf = (roleId: string | undefined) => state.roles.find(({ id }) => id === roleId);
  const own = roleOf(state.users.find(({ id }) => id === user.id)?.role.id) ?? {
    grantsAll: false,
    permissions: [],
  };
  const membership = project.members.find(({ userId }) => userId === user.id);
  return projectPermissionsOf({
    role: own,
    allProjects: state.allProjects.has(user.id),
    membership: membership ? { role: roleOf(membership.roleId ?? undefined) ?? null } : null,
  });
}

/** Whether the signed-in user manages `project`'s settings or access. */
function managesProject(state: FakeServerState, project: FakeProject): boolean {
  const permissions = projectPermissionsFor(state, project) ?? [];
  return can(permissions, 'project.settings.manage') || can(permissions, 'project.members.manage');
}

const byName = (left: { name: string; key: string }, right: { name: string; key: string }) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
  left.key.localeCompare(right.key);

/** `GET /api/v1/projects`: the projects the user reaches or manages, searched, by state, paged. */
function listProjects(state: FakeServerState, search: URLSearchParams): Response {
  const archived = search.get('state') === 'archived';
  const managed = search.get('scope') === 'managed';
  const needle = fold(search.get('search') ?? '');
  const page = Number(search.get('page') ?? '1');
  const visible = state.projects
    .filter((project) =>
      managed ? managesProject(state, project) : projectPermissionsFor(state, project) !== null,
    )
    .filter(({ key, name }) => [key, name].some((text) => fold(text).includes(needle)))
    .sort(byName);
  const inState = visible.filter((project) => project.archived === archived);
  return json({
    rows: inState
      .slice((page - 1) * PROJECTS_PAGE_SIZE, page * PROJECTS_PAGE_SIZE)
      .map(({ id, key, name, description, color, members }) => {
        const listed = members
          .flatMap(({ userId }) => state.users.filter((user) => user.id === userId))
          .sort((left, right) => left.name.localeCompare(right.name));
        return {
          id,
          key,
          name,
          description,
          color,
          members: managed
            ? {
                count: listed.length,
                shown: listed
                  .slice(0, PROJECT_MEMBERS_PREVIEW)
                  .map((user) => ({ userId: user.id, name: user.name })),
              }
            : null,
          issues: managed ? issueStatsOf(state, key) : null,
        };
      }),
    matching: inState.length,
    counts: {
      active: visible.filter((project) => !project.archived).length,
      archived: visible.filter((project) => project.archived).length,
    },
    page,
    pageSize: PROJECTS_PAGE_SIZE,
  });
}

/** A project's open and urgent issues, as the projects screen shows them. */
function issueStatsOf(state: FakeServerState, projectKey: string) {
  const urgent = defaultField(DEFAULT_PRIORITIES, 'urgent').id;
  const open = state.issues.filter((issue) => issue.projectKey === projectKey && !issue.closedAt);
  return {
    open: open.length,
    urgent: open.filter((issue) => issue.priorityId === urgent).length,
    lastActivityAt: null,
  };
}

/** `POST /api/v1/projects`: its creator gets access. */
function createProject(state: FakeServerState, body: Record<string, unknown>): Response {
  const key = String(body['key']);
  if (state.projects.some((project) => project.key === key)) {
    return apiError(409, 'PROJECT_KEY_TAKEN');
  }
  const id = `01a1569b-9900-7000-8000-0000000004${String(state.projects.length).padStart(2, '0')}`;
  state.projects.push({
    id,
    key,
    name: String(body['name']).trim(),
    description: String(body['description'] ?? '').trim(),
    color: projectColorFor(state.projects.length),
    archived: false,
    keyEditable: true,
    members: state.user ? [{ userId: state.user.id, roleId: null }] : [],
  });
  return json({ id, key }, 201);
}

const PROJECT_PATH =
  /^\/api\/v1\/projects\/([^/]+)(?:\/(archive|unarchive|access|members|invitations|candidates|roles|issues|issue-fields|assignees|workflow|properties|fields))?(?:\/([^/]+))?(?:\/(adaptation|status|fields|assignee|labels|delete))?$/;

/** `/api/v1/projects/:key` and what hangs off it, with the server's rules. */
function projectRequest(
  state: FakeServerState,
  method: string,
  path: string,
  search: URLSearchParams,
  body: unknown,
): Response | undefined {
  const match = PROJECT_PATH.exec(path);
  if (!match) {
    return undefined;
  }
  const [, key, part = '', target = '', sub = ''] = match;
  const project = state.projects.find((candidate) => candidate.key === key);
  const permissions = project ? projectPermissionsFor(state, project) : null;
  if (!(project && permissions)) {
    return asSignedIn(state) ?? apiError(404, 'PROJECT_NOT_FOUND');
  }
  const unless = (permission: ProjectPermission, answer: () => Response) => {
    if (!can(permissions, permission)) {
      return apiError(403, 'FORBIDDEN');
    }
    const writes = method !== 'GET' && part !== 'unarchive';
    return writes && project.archived ? apiError(409, 'PROJECT_ARCHIVED') : answer();
  };
  const fields = (body ?? {}) as Record<string, unknown>;
  switch (`${method} ${part}`) {
    case 'GET ': {
      const { members: _members, ...shown } = project;
      return json({ ...shown, permissions });
    }
    case 'PATCH ':
      return unless('project.settings.manage', () => updateProject(state, project, fields));
    case 'DELETE ':
      // An instance permission, held through one's own role.
      return (
        asHolder(state, 'project.delete') ??
        (() => {
          state.projects = state.projects.filter((candidate) => candidate !== project);
          return NO_CONTENT();
        })()
      );
    case 'POST archive':
    case 'POST unarchive':
      return unless('project.settings.manage', () => {
        project.archived = part === 'archive';
        return NO_CONTENT();
      });
    case 'GET access':
      return unless('project.members.manage', () => projectAccess(state, project, search));
    case 'DELETE invitations':
      return unless('project.members.manage', () => {
        const access = state.invitationProjects.get(target);
        if (!access?.projectKeys.includes(project.key)) {
          return apiError(404, 'INVITATION_NOT_FOUND');
        }
        access.projectKeys = access.projectKeys.filter((other) => other !== project.key);
        return NO_CONTENT();
      });
    case 'POST members':
    case 'PATCH members':
    case 'DELETE members':
      return unless('project.members.manage', () =>
        changeProjectMembers(state, project, permissions, method, target, fields),
      );
    case 'GET candidates':
      return unless('project.members.manage', () => {
        const needle = fold(search.get('search') ?? '');
        return json({
          people: state.users
            .filter(({ id }) => !project.members.some((member) => member.userId === id))
            .filter((user) => accessReason(state, project, user) === null)
            .filter(({ name, email }) => [name, email].some((text) => fold(text).includes(needle)))
            .map(({ id, name, email }) => ({ id, name, email })),
        });
      });
    case 'GET issues':
      return listIssues(state, project, permissions, search);
    case 'POST issues':
      if (target === 'bulk') {
        return unless(BULK_PERMISSIONS[sub] ?? 'issue.update', () =>
          bulkIssues(state, project, permissions, sub, fields),
        );
      }
      return unless('issue.create', () =>
        createIssue(state, project, fields, can(permissions, 'issue.assign')),
      );
    case 'GET properties':
    case 'POST properties':
    case 'PUT properties':
    case 'DELETE properties':
    case 'PUT fields':
      return unless('project.settings.manage', () =>
        projectPropertyRequest(state, project, method, part, target, sub, body),
      );
    case 'GET issue-fields':
      return json(issueFields(state, project.key));
    case 'GET workflow':
      return unless('project.settings.manage', () => json(projectWorkflowOf(state, project)));
    case 'POST workflow':
    case 'PUT workflow':
      return unless('project.settings.manage', () =>
        changeProjectWorkflow(state, project, method, target, fields),
      );
    case 'GET assignees':
      return unless('issue.assign', () => {
        const needle = fold(search.get('search') ?? '');
        return json({
          people: state.users
            .filter((user) => !user.deactivatedAt && accessReason(state, project, user) !== null)
            .filter(({ name, email }) => [name, email].some((text) => fold(text).includes(needle)))
            .map(({ id, name, email }) => ({ id, name, email })),
        });
      });
    case 'GET roles':
      return unless('project.members.manage', () =>
        json({
          roles: badgesOf(state).filter((badge) => {
            const role = state.roles.find(({ id }) => id === badge.id);
            return role !== undefined && canGiveProjectRole(permissions, role);
          }),
        }),
      );
    default:
      return apiError(404, 'NOT_FOUND');
  }
}

function updateProject(
  state: FakeServerState,
  project: FakeProject,
  fields: Record<string, unknown>,
): Response {
  if (project.archived) {
    return apiError(409, 'PROJECT_ARCHIVED');
  }
  const key = String(fields['key']);
  if (key !== project.key && !project.keyEditable) {
    return apiError(409, 'PROJECT_KEY_FIXED');
  }
  if (state.projects.some((other) => other !== project && other.key === key)) {
    return apiError(409, 'PROJECT_KEY_TAKEN');
  }
  Object.assign(project, {
    key,
    name: String(fields['name']).trim(),
    description: String(fields['description']).trim(),
  });
  return NO_CONTENT();
}

/** How `user` reaches `project` whatever its members, or `null` through them only. */
function accessReason(
  state: FakeServerState,
  project: FakeProject,
  user: UserSummary,
): 'systemRole' | 'allProjects' | 'member' | null {
  if (state.roles.find(({ id }) => id === user.role.id)?.grantsAll) {
    return 'systemRole';
  }
  if (state.allProjects.has(user.id)) {
    return 'allProjects';
  }
  return project.members.some((member) => member.userId === user.id) ? 'member' : null;
}

const ACCESS_ORDER = { systemRole: 0, allProjects: 1, member: 2 } as const;

/** `GET /api/v1/projects/:key/access`: people by how they reach the project, then invitations. */
function projectAccess(
  state: FakeServerState,
  project: FakeProject,
  search: URLSearchParams,
): Response {
  const needle = fold(search.get('search') ?? '');
  const page = Number(search.get('page') ?? '1');
  const people = state.users
    .filter(({ name, email }) => [name, email].some((text) => fold(text).includes(needle)))
    .flatMap((user) => {
      const access = accessReason(state, project, user);
      const roleId = project.members.find((member) => member.userId === user.id)?.roleId;
      return access
        ? [
            {
              kind: 'person' as const,
              userId: user.id,
              name: user.name,
              email: user.email,
              access,
              ownRole: user.role,
              projectRole: badgesOf(state).find(({ id }) => id === roleId) ?? null,
              deactivatedAt: user.deactivatedAt,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        ACCESS_ORDER[left.access] - ACCESS_ORDER[right.access] ||
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
    );
  const invitations = state.invitations.flatMap((invitation): ProjectAccessRow[] => {
    const access = state.invitationProjects.get(invitation.id);
    const gives = access && (access.allProjects || access.projectKeys.includes(project.key));
    return gives && fold(invitation.email).includes(needle)
      ? [
          {
            kind: 'invitation',
            invitationId: invitation.id,
            email: invitation.email,
            role: invitation.role,
            allProjects: access.allProjects,
            expiresAt: invitation.expiresAt,
          },
        ]
      : [];
  });
  const rows = [...people, ...invitations];
  return json({
    rows: rows.slice((page - 1) * PROJECT_ACCESS_PAGE_SIZE, page * PROJECT_ACCESS_PAGE_SIZE),
    matching: rows.length,
    page,
    pageSize: PROJECT_ACCESS_PAGE_SIZE,
  });
}

/** Adds, changes or removes members; nobody gets more than the caller holds in the project. */
function changeProjectMembers(
  state: FakeServerState,
  project: FakeProject,
  permissions: readonly ProjectPermission[],
  method: string,
  userId: string,
  fields: Record<string, unknown>,
): Response {
  const roleId = (fields['roleId'] as string | null | undefined) ?? null;
  const role = state.roles.find(({ id }) => id === roleId);
  if (method !== 'DELETE' && role && !canGiveProjectRole(permissions, role)) {
    return apiError(403, 'ROLE_BEYOND_YOURS');
  }
  if (method === 'POST') {
    for (const id of (fields['userIds'] as string[] | undefined) ?? []) {
      if (!project.members.some((member) => member.userId === id)) {
        project.members.push({ userId: id, roleId });
      }
    }
    return NO_CONTENT();
  }
  const member = project.members.find((candidate) => candidate.userId === userId);
  if (!member) {
    return apiError(404, 'MEMBER_NOT_FOUND');
  }
  const refusal = memberRefusal(state, permissions, member, roleId);
  if (refusal) {
    return refusal;
  }
  if (method === 'DELETE') {
    project.members = project.members.filter((candidate) => candidate !== member);
  } else {
    member.roleId = roleId;
  }
  return NO_CONTENT();
}

/** Why a change to `member` is refused, or `undefined` when it may go on. */
function memberRefusal(
  state: FakeServerState,
  permissions: readonly ProjectPermission[],
  member: FakeProject['members'][number],
  roleId: string | null,
): Response | undefined {
  const roleOf = (id: string | undefined) => state.roles.find((role) => role.id === id);
  const ownRole = roleOf(state.users.find(({ id }) => id === member.userId)?.role.id);
  if (roleId && ownRole?.grantsAll) {
    return apiError(409, 'SYSTEM_ROLE_HOLDER');
  }
  const current = roleOf(member.roleId ?? ownRole?.id);
  return current && !canActOnProjectMember(permissions, current)
    ? apiError(403, 'ROLE_BEYOND_YOURS')
    : undefined;
}

/** `/api/v1/users/:id/projects` and `/api/v1/users/:id/projects/:key`. */
function userProjects(
  state: FakeServerState,
  method: string,
  path: string,
  search: URLSearchParams,
  body: unknown,
): Response | undefined {
  const match = /^\/api\/v1\/users\/([^/]+)\/projects(?:\/([^/]+))?$/.exec(path);
  if (!match) {
    return undefined;
  }
  const refusal = asUserManager(state);
  if (refusal) {
    return refusal;
  }
  const [, userId = '', key] = match;
  const reachable = state.projects.filter(
    (project) => !project.archived && projectPermissionsFor(state, project) !== null,
  );
  const isMember = (project: FakeProject) =>
    project.members.some((member) => member.userId === userId);
  if (method === 'GET') {
    const needle = fold(search.get('search') ?? '');
    return json({
      allProjects: state.allProjects.has(userId),
      rows: reachable
        .filter((project) =>
          [project.key, project.name].some((text) => fold(text).includes(needle)),
        )
        .sort(
          (left, right) => Number(isMember(right)) - Number(isMember(left)) || byName(left, right),
        )
        .map((project) => ({ key: project.key, name: project.name, member: isMember(project) })),
    });
  }
  if (!key) {
    if ((body as { allProjects?: boolean } | undefined)?.allProjects === true) {
      state.allProjects.add(userId);
    } else {
      state.allProjects.delete(userId);
    }
    return NO_CONTENT();
  }
  const project = reachable.find((candidate) => candidate.key === key);
  if (!project) {
    return apiError(404, 'PROJECT_NOT_FOUND');
  }
  if (method === 'PUT' && !isMember(project)) {
    project.members.push({ userId, roleId: null });
  }
  if (method === 'DELETE') {
    project.members = project.members.filter((member) => member.userId !== userId);
  }
  return NO_CONTENT();
}

/** Someone an issue names, as the server does: a deleted account loses its name. */
function userRef(state: FakeServerState, id: string) {
  const user = state.users.find((candidate) => candidate.id === id);
  return { id, name: user?.name ?? null };
}

/** `PUT /api/v1/categories`: the whole list at once, as the server checks and applies it. */
function saveCategories(state: FakeServerState, body: Record<string, unknown>): Response {
  const request = categoriesRequestSchema.safeParse(body);
  if (!request.success) {
    return apiError(400, 'VALIDATION_ERROR');
  }
  const plan = planCategories(
    state.categories.map(({ id }) => id),
    request.data.categories,
    request.data.removed,
  );
  if (!plan) {
    return apiError(409, 'CATEGORIES_CHANGED');
  }
  if (state.issues.some(({ categoryId }) => plan.removed.includes(categoryId))) {
    return apiError(409, 'CATEGORY_IN_USE');
  }
  const added = plan.added.map((category) => ({
    ...category,
    id: `01a1569b-9900-7000-8000-0000000007${String(category.position).padStart(2, '0')}`,
  }));
  state.categories = [...plan.kept, ...added]
    .toSorted((left, right) => left.position - right.position)
    .map(({ id, name, color, isDefault }) => ({ id, name, color, isDefault }));
  return NO_CONTENT();
}

/** Labels by name, whatever the case, as the server lists them. */
const byLabelName = (labels: readonly LabelRef[]) =>
  labels.toSorted((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));

/** `PUT /api/v1/labels`: the whole list at once; a label removed leaves its issues, told so. */
function saveLabels(state: FakeServerState, body: Record<string, unknown>): Response {
  const request = labelsRequestSchema.safeParse(body);
  if (!request.success) {
    return apiError(400, 'VALIDATION_ERROR');
  }
  const plan = planOptions(
    state.labels.map(({ id }) => id),
    request.data.labels,
    request.data.removed,
  );
  if (!plan) {
    return apiError(409, 'LABELS_CHANGED');
  }
  for (const issue of state.issues) {
    const lost = state.labels.filter(
      ({ id }) => plan.removed.includes(id) && issue.labelIds.includes(id),
    );
    if (lost.length > 0) {
      issue.labelIds = issue.labelIds.filter((id) => !plan.removed.includes(id));
      record(state, keyOf(issue), {
        type: 'issue.labelsChanged',
        payload: { added: [], removed: lost.map(({ id, name }) => ({ id, name })) },
      });
    }
  }
  const added = plan.added.map(({ name, color }, index) => ({
    id: `01a1569b-9900-7000-8000-0000000011${String(state.labels.length + index).padStart(2, '0')}`,
    name,
    color,
  }));
  state.labels = [...plan.kept.map(({ id, name, color }) => ({ id, name, color })), ...added];
  return NO_CONTENT();
}

/** What each action on several issues needs. */
const BULK_PERMISSIONS: Record<string, ProjectPermission> = {
  status: 'issue.update',
  fields: 'issue.update',
  assignee: 'issue.assign',
  labels: 'issue.update',
  delete: 'issue.delete',
};

/**
 * `POST /api/v1/projects/:key/issues/bulk/:action`: each issue the caller sees takes the change
 * as it would alone, the others refused with why.
 */
function bulkIssues(
  state: FakeServerState,
  project: FakeProject,
  permissions: readonly ProjectPermission[],
  action: string,
  fields: Record<string, unknown>,
): Response {
  const keys = Array.isArray(fields['issueKeys']) ? (fields['issueKeys'] as string[]) : [];
  const added = Array.isArray(fields['add']) ? (fields['add'] as string[]) : [];
  if (added.some((id) => !state.labels.some((label) => label.id === id))) {
    return apiError(400, 'INVALID_LABEL');
  }
  const changed: string[] = [];
  const refused: { key: string; code: string }[] = [];
  for (const key of keys) {
    const issue = state.issues.find(
      (candidate) => keyOf(candidate) === key && candidate.projectKey === project.key,
    );
    if (!(issue && canSeeIssue(permissions, issue.reporterId === state.user?.id))) {
      refused.push({ key, code: 'ISSUE_NOT_FOUND' });
      continue;
    }
    const before = JSON.stringify(issue);
    const refusal = bulkChange(state, issue, action, fields);
    if (refusal) {
      refused.push({ key, code: refusal });
    } else if (action === 'delete' || JSON.stringify(issue) !== before) {
      changed.push(key);
    }
  }
  return json({ changed, refused });
}

/** One issue taking an action on several, as it would alone: answers why not, if it may not. */
function bulkChange(
  state: FakeServerState,
  issue: FakeIssue,
  action: string,
  fields: Record<string, unknown>,
): 'STATUS_NOT_ALLOWED' | null {
  const list = (name: string) => (Array.isArray(fields[name]) ? (fields[name] as string[]) : []);
  const statusId = String(fields['statusId']);
  const assigneeId = typeof fields['assigneeId'] === 'string' ? fields['assigneeId'] : null;
  switch (action) {
    case 'status':
      return issue.statusId !== statusId && moveIssue(state, issue, statusId).status === 409
        ? 'STATUS_NOT_ALLOWED'
        : null;
    case 'fields':
      updateIssue(state, issue, ['editFields'], fields);
      return null;
    case 'assignee':
      if (issue.assigneeId !== assigneeId) {
        assignIssue(state, issue, assigneeId);
      }
      return null;
    case 'labels': {
      const kept = issue.labelIds.filter((id) => !list('remove').includes(id));
      setLabels(state, issue, { labelIds: [...new Set([...kept, ...list('add')])] });
      return null;
    }
    default:
      state.issues = state.issues.filter((candidate) => candidate !== issue);
      return null;
  }
}

/** `PUT /api/v1/issues/:key/labels`: exactly the labels asked for, the change told once. */
function setLabels(
  state: FakeServerState,
  issue: FakeIssue,
  body: Record<string, unknown>,
): Response {
  const request = issueLabelsRequestSchema.safeParse(body);
  if (!request.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const { labelIds } = request.data;
  if (labelIds.some((id) => !state.labels.some((label) => label.id === id))) {
    return apiError(400, 'INVALID_LABEL');
  }
  const named = (ids: readonly string[]) =>
    ids
      .flatMap((id) => state.labels.filter((label) => label.id === id))
      .map(({ id, name }) => ({ id, name }));
  const added = labelIds.filter((id) => !issue.labelIds.includes(id));
  const removed = issue.labelIds.filter((id) => !labelIds.includes(id));
  if (added.length > 0 || removed.length > 0) {
    record(state, keyOf(issue), {
      type: 'issue.labelsChanged',
      payload: { added: named(added), removed: named(removed) },
    });
  }
  issue.labelIds = [...labelIds];
  return NO_CONTENT();
}

/** Keeps a workflow `changeWorkflow` answered, or passes its refusal on. */
function saved(result: FakeWorkflow | Response, keep: (workflow: FakeWorkflow) => void): Response {
  if (result instanceof Response) {
    return result;
  }
  keep(result);
  return NO_CONTENT();
}

/**
 * A whole workflow saved at once, as the server checks and applies it: the issues `governs`
 * selects move off the statuses taken out. Answers the new workflow, or the refusal.
 */
function changeWorkflow(
  state: FakeServerState,
  current: FakeWorkflow,
  body: Record<string, unknown>,
  governs: (issue: FakeIssue) => boolean,
): FakeWorkflow | Response {
  const request = workflowRequestSchema.safeParse(body);
  if (!request.success) {
    return apiError(400, 'VALIDATION_ERROR');
  }
  const plan = planWorkflow(
    current.statuses.map(({ id }) => id),
    request.data,
  );
  if (!plan) {
    return apiError(409, 'WORKFLOW_CHANGED');
  }
  const ids = new Map(plan.kept.map(({ id }) => [id, id]));
  for (const { ref, position } of plan.added) {
    ids.set(ref, `01a1569b-9900-7000-8000-0000000006${String(position).padStart(2, '0')}`);
  }
  for (const { statusId, moveTo } of plan.removed) {
    for (const issue of state.issues.filter(
      (candidate) => candidate.statusId === statusId && governs(candidate),
    )) {
      issue.statusId = ids.get(moveTo) ?? moveTo;
    }
  }
  return {
    mode: request.data.mode,
    statuses: [...plan.kept, ...plan.added]
      .toSorted((left, right) => left.position - right.position)
      .map(({ position, ...status }) => ({
        id: 'id' in status ? status.id : (ids.get(status.ref) ?? status.ref),
        name: status.name,
        color: status.color,
        closes: status.closes,
        isInitial: status.isInitial,
      })),
    transitions: request.data.transitions.map(({ from, to }) => ({
      from: ids.get(from) ?? from,
      to: ids.get(to) ?? to,
    })),
  };
}

/** `GET /api/v1/projects/:key/workflow`: the project's own workflow, or the instance's. */
function projectWorkflowOf(state: FakeServerState, project: FakeProject) {
  const copy = state.projectWorkflows.get(project.key);
  const followed = copy ?? state.workflow;
  return {
    customized: copy !== undefined,
    mode: followed.mode,
    statuses: followed.statuses.map((status) => ({
      ...status,
      issueCount: state.issues.filter(
        ({ projectKey, statusId }) => projectKey === project.key && statusId === status.id,
      ).length,
      shared: state.workflow.statuses.some(({ id }) => id === status.id),
    })),
    transitions: followed.transitions,
    organization: state.workflow.statuses,
  };
}

/** `/api/v1/projects/:key/workflow` and its `customize` and `revert`, as the server applies them. */
function changeProjectWorkflow(
  state: FakeServerState,
  project: FakeProject,
  method: string,
  target: string,
  body: Record<string, unknown>,
): Response {
  const copy = state.projectWorkflows.get(project.key);
  if (method === 'POST' && target === 'customize') {
    if (copy) {
      return apiError(409, 'ALREADY_CUSTOMIZED');
    }
    state.projectWorkflows.set(project.key, structuredClone(state.workflow));
    return NO_CONTENT();
  }
  if (!copy) {
    return apiError(409, 'NOT_CUSTOMIZED');
  }
  if (method === 'PUT') {
    return saved(
      changeWorkflow(state, copy, body, ({ projectKey }) => projectKey === project.key),
      (workflow) => state.projectWorkflows.set(project.key, workflow),
    );
  }
  const moves = (body['moves'] ?? []) as { statusId: string; moveTo: string }[];
  for (const issue of state.issues.filter(({ projectKey }) => projectKey === project.key)) {
    if (!state.workflow.statuses.some(({ id }) => id === issue.statusId)) {
      const move = moves.find(({ statusId }) => statusId === issue.statusId);
      if (!move) {
        return apiError(409, 'MOVE_REQUIRED');
      }
      issue.statusId = move.moveTo;
    }
  }
  state.projectWorkflows.delete(project.key);
  return NO_CONTENT();
}

/** `PUT /api/v1/priorities`: the four levels' names and the default at once. */
function savePriorities(state: FakeServerState, body: Record<string, unknown>): Response {
  const request = prioritiesRequestSchema.safeParse(body);
  if (!request.success) {
    return apiError(400, 'VALIDATION_ERROR');
  }
  const named = new Map(request.data.priorities.map((level) => [level.id, level]));
  if (state.priorities.some(({ id }) => !named.has(id))) {
    return apiError(404, 'PRIORITY_NOT_FOUND');
  }
  state.priorities = state.priorities.map((level) => ({
    ...level,
    name: named.get(level.id)?.name ?? level.name,
    isDefault: named.get(level.id)?.isDefault ?? false,
  }));
  return NO_CONTENT();
}

/** The response's shape of an issue's fields: the default workflow, the instance's lists. */
function issueFields(state: FakeServerState, projectKey: string) {
  const workflow = workflowOf(state, projectKey);
  const moves = movesOf(workflow);
  return {
    statuses: workflow.statuses.map((status) => ({
      ...status,
      next: nextStatusesOf(moves, status.id),
    })),
    categories: state.categories,
    priorities: state.priorities,
    labels: byLabelName(state.labels),
    properties: effectiveOf(state, projectKey).map(
      ({ projectKey: _projectKey, ...field }) => field,
    ),
    fieldSettings: fieldSettingsOf(state.projects.find(({ key }) => key === projectKey)),
  };
}

/** The values of an issue's properties, oldest property first: those shown in lists, or all. */
function propertyValuesOf(
  state: FakeServerState,
  issue: FakeIssue,
  { listedOnly }: { listedOnly: boolean },
): IssuePropertyValue[] {
  return effectiveOf(state, issue.projectKey).flatMap((property) => {
    const value = issue.properties[property.id];
    const shown = value === undefined ? null : shownValueOf(state, property, value);
    return shown && (property.shownInList || !listedOnly) ? [shown] : [];
  });
}

/** A value as it reads, by its property's type: options in their order, someone by name. */
function shownValueOf(
  state: FakeServerState,
  property: IssuePropertyField,
  value: PropertyValue,
): IssuePropertyValue | null {
  const { id, name } = property;
  switch (property.type) {
    case 'list': {
      const option = property.options.find((candidate) => candidate.id === value);
      return option ? { id, name, type: 'list', value: option } : null;
    }
    case 'multiSelect': {
      const chosen = property.options.filter(
        (option) => Array.isArray(value) && value.includes(option.id),
      );
      return chosen.length > 0 ? { id, name, type: 'multiSelect', value: chosen } : null;
    }
    case 'user':
      return typeof value === 'string'
        ? { id, name, type: 'user', value: userRef(state, value) }
        : null;
    case 'number':
      return typeof value === 'number' ? { id, name, type: 'number', value } : null;
    case 'checkbox':
      return value === true ? { id, name, type: 'checkbox', value } : null;
    case 'date':
      return typeof value === 'string' ? { id, name, type: 'date', value } : null;
    case 'text':
      return typeof value === 'string' ? { id, name, type: 'text', value } : null;
  }
}

/** What decides the values a property takes, as `@toppo/core` checks them. */
const rulesOf = ({ id, type, askedAtCreation, required, options }: IssuePropertyField) =>
  ({ id, type, askedAtCreation, required, optionIds: options.map((option) => option.id) }) as const;

/** What the server answers when a value cannot be given. */
const PROPERTY_REFUSALS: Readonly<Record<PropertyProblem['problem'], string>> = {
  unknownProperty: 'PROPERTY_NOT_FOUND',
  invalidValue: 'INVALID_PROPERTY_VALUE',
  unknownOption: 'INVALID_PROPERTY_OPTION',
  missingRequired: 'PROPERTY_REQUIRED',
};

/**
 * A change of a property's value as the history shows it: options by their names now, wherever
 * they belong, someone by name.
 */
function shownChange(
  state: FakeServerState,
  property: FakeProperty,
  from: PropertyValue | null,
  to: PropertyValue | null,
): Extract<IssueActivity, { type: 'issue.propertyChanged' }>['payload'] {
  const names = new Map(
    [
      ...property.options,
      ...state.propertyAdaptations.flatMap((adaptation) =>
        adaptation.propertyId === property.id ? (adaptation.options ?? []) : [],
      ),
    ].map((option) => [option.id, option.name]),
  );
  const change = propertyChangeOf(property, from, to, names);
  const person = (userId: string | null) => (userId ? userRef(state, userId) : null);
  return change.type === 'user'
    ? { ...change, from: person(change.from), to: person(change.to) }
    : change;
}

const keyOf = (issue: FakeIssue) => `${issue.projectKey}-${issue.number}`;

function summaryOf(state: FakeServerState, issue: FakeIssue): IssueSummary {
  const fields = issueFields(state, issue.projectKey);
  const status = fields.statuses.find(({ id }) => id === issue.statusId);
  const category = fields.categories.find(({ id }) => id === issue.categoryId);
  const priority = fields.priorities.find(({ id }) => id === issue.priorityId);
  if (!(status && category && priority)) {
    throw new Error(`${keyOf(issue)} has a field the defaults do not know`);
  }
  return {
    key: keyOf(issue),
    title: issue.title,
    status: { id: status.id, name: status.name, color: status.color, closes: status.closes },
    category: { id: category.id, name: category.name, color: category.color },
    priority: { id: priority.id, name: priority.name, level: priority.level },
    assignee: issue.assigneeId ? userRef(state, issue.assigneeId) : null,
    reporter: userRef(state, issue.reporterId),
    labels: byLabelName(state.labels.filter(({ id }) => issue.labelIds.includes(id))),
    properties: propertyValuesOf(state, issue, { listedOnly: true }),
    createdAt: issue.createdAt,
    updatedAt: issue.createdAt,
  };
}

/**
 * `GET /api/v1/projects/:key/issues`: searched, filtered, sorted and grouped like the server, only
 * one's own when that is all one sees.
 */
function listIssues(
  state: FakeServerState,
  project: FakeProject,
  permissions: readonly ProjectPermission[],
  search: URLSearchParams,
): Response {
  const parsed = projectIssuesQuerySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const query = parsed.data;
  const conditions: PropertyCondition[] = [];
  for (const filter of query.property ?? []) {
    const property = effectiveOf(state, project.key).find(({ id }) => id === filter.propertyId);
    const condition = property && propertyConditionOf(property, filter, state.user?.id ?? '');
    if (!condition) {
      return apiError(400, property ? 'INVALID_PROPERTY_FILTER' : 'PROPERTY_NOT_FOUND');
    }
    conditions.push(condition);
  }
  const visibility = issueVisibilityOf(permissions);
  const statusOrder = workflowOf(state, project.key).statuses.map(({ id }) => id);
  const matching = state.issues
    .filter((issue) => issue.projectKey === project.key)
    .filter(
      (issue) =>
        visibility === 'all' || (visibility === 'own' && issue.reporterId === state.user?.id),
    )
    .filter((issue) => matchesQuery(state, issue, query))
    .filter((issue) =>
      conditions.every((condition) =>
        meetsCondition(condition, issue.properties[condition.propertyId]),
      ),
    )
    .map((issue) => summaryOf(state, issue));
  const values = sortValues(state, statusOrder);
  const grouping = query.group ? issueGroupings(values)[query.group] : null;
  const sort = compareBy(values[query.sort], query.order ?? ISSUE_SORT_ORDERS[query.sort]);
  const sorted = matching.sort(
    (left, right) =>
      (grouping?.compare(left, right) ?? 0) ||
      sort(left, right) ||
      numberOf(right) - numberOf(left),
  );
  const groups = grouping
    ? [...new Set(sorted.map(grouping.key))].map((key) => ({
        key,
        count: sorted.filter((issue) => grouping.key(issue) === key).length,
      }))
    : null;
  return json({
    rows: sorted.slice((query.page - 1) * ISSUES_PAGE_SIZE, query.page * ISSUES_PAGE_SIZE),
    matching: sorted.length,
    page: query.page,
    pageSize: ISSUES_PAGE_SIZE,
    groups,
  });
}

const numberOf = (issue: IssueSummary) => Number(issue.key.split('-')[1]);

/** Whether an issue passes a list's search and filters, `me` standing for the signed-in user. */
function matchesQuery(
  state: FakeServerState,
  issue: FakeIssue,
  query: z.output<typeof projectIssuesQuerySchema>,
): boolean {
  const me = state.user?.id;
  const people = (values: readonly string[]) =>
    values.map((value) => (value === 'me' ? me : value));
  const needle = fold(query.search ?? '');
  const checks = [
    query.state === undefined || (query.state === 'open') === (issue.closedAt === null),
    !query.status || query.status.includes(issue.statusId),
    !query.priority || query.priority.includes(issue.priorityId),
    !query.category || query.category.includes(issue.categoryId),
    !query.label || query.label.some((id) => issue.labelIds.includes(id)),
    !query.assignee || people(query.assignee).includes(issue.assigneeId ?? 'none'),
    !query.reporter || people(query.reporter).includes(issue.reporterId),
    !needle ||
      [issue.title, issue.description].some((text) => fold(text).includes(needle)) ||
      fold(keyOf(issue)) === needle,
  ];
  return checks.every(Boolean);
}

type IssueOrder = (left: IssueSummary, right: IssueSummary) => number;

type SortValue = (issue: IssueSummary) => string | number | null;

/** Issues in `order` of `value`, those without one (no assignee) last either way. */
function compareBy(value: SortValue, order: SortOrder): IssueOrder {
  return (left, right) => {
    const [first, second] = [value(left), value(right)];
    if (first === null || second === null) {
      return (first === null ? 1 : 0) - (second === null ? 1 : 0);
    }
    const ascending =
      typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first).localeCompare(String(second));
    return order === 'asc' ? ascending : -ascending;
  };
}

/** What the server sorts by, column by column; categories and statuses in their set order. */
function sortValues(
  state: FakeServerState,
  statusOrder: readonly string[],
): Record<IssueSort, SortValue> {
  const categoryOrder = state.categories.map(({ id }) => id);
  return {
    key: numberOf,
    title: (issue) => issue.title.toLowerCase(),
    reporter: (issue) => issue.reporter.name,
    category: (issue) => categoryOrder.indexOf(issue.category.id),
    priority: (issue) => issue.priority.level,
    status: (issue) => statusOrder.indexOf(issue.status.id),
    assignee: (issue) => issue.assignee?.name ?? null,
    updated: (issue) => issue.updatedAt,
  };
}

/** The groupings of the server: what groups issues, and the order of the groups. */
function issueGroupings(
  values: Record<IssueSort, SortValue>,
): Record<IssueGrouping, { key: (issue: IssueSummary) => string | null; compare: IssueOrder }> {
  return {
    status: { key: (issue) => issue.status.id, compare: compareBy(values.status, 'asc') },
    priority: { key: (issue) => issue.priority.id, compare: compareBy(values.priority, 'desc') },
    assignee: {
      key: (issue) => issue.assignee?.id ?? null,
      compare: compareBy(values.assignee, 'asc'),
    },
  };
}

/**
 * `GET /api/v1/issues/assigned`: the signed-in user's issues they may still read, out of archived
 * projects, the most urgent first, then the newest.
 */
function listAssignedIssues(state: FakeServerState, search: URLSearchParams): Response {
  const page = Number(search.get('page') ?? '1');
  const visible = state.issues
    .filter((issue) => issue.assigneeId === state.user?.id)
    .flatMap((issue) => {
      const project = state.projects.find((candidate) => candidate.key === issue.projectKey);
      const permissions = project ? projectPermissionsFor(state, project) : null;
      const reported = issue.reporterId === state.user?.id;
      return project && !project.archived && permissions && canSeeIssue(permissions, reported)
        ? [
            {
              ...summaryOf(state, issue),
              project: { key: project.key, name: project.name, color: project.color },
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        right.priority.level - left.priority.level || right.createdAt.localeCompare(left.createdAt),
    );
  return json({
    rows: visible.slice((page - 1) * ISSUES_PAGE_SIZE, page * ISSUES_PAGE_SIZE),
    matching: visible.length,
    page,
    pageSize: ISSUES_PAGE_SIZE,
  });
}

/**
 * `GET /api/v1/issues/search`: the issues the signed-in user may read, out of archived projects,
 * that a search finds: the one named by its key first, then those with the words in their title,
 * then in their description.
 */
function searchIssues(state: FakeServerState, search: URLSearchParams): Response {
  const parsed = issueSearchQuerySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const needle = fold(parsed.data.search);
  const rankOf = (issue: FakeIssue): number | null => {
    if (fold(keyOf(issue)) === needle) {
      return 0;
    }
    if (fold(issue.title).includes(needle)) {
      return 1;
    }
    return fold(issue.description).includes(needle) ? 2 : null;
  };
  const found = state.issues.flatMap((issue) => {
    const project = state.projects.find((candidate) => candidate.key === issue.projectKey);
    const permissions = project ? projectPermissionsFor(state, project) : null;
    const reported = issue.reporterId === state.user?.id;
    const rank = rankOf(issue);
    return project &&
      !project.archived &&
      permissions &&
      canSeeIssue(permissions, reported) &&
      rank !== null
      ? [
          {
            rank,
            issue: {
              ...summaryOf(state, issue),
              project: { key: project.key, name: project.name, color: project.color },
            },
          },
        ]
      : [];
  });
  return json({
    rows: found
      .sort((left, right) => left.rank - right.rank)
      .slice(0, ISSUE_SEARCH_LIMIT)
      .map(({ issue }) => issue),
  });
}

/**
 * When the request being answered came: every change it makes shares it, as on the server, where
 * they share their transaction's time; the history then shows them as one step.
 */
let requestTime = new Date().toISOString();

function record(
  state: FakeServerState,
  key: string,
  change: Omit<IssueActivity, 'id' | 'actor' | 'createdAt'>,
) {
  const history = state.activities.get(key) ?? [];
  history.push({
    id: `01a1569b-9900-7000-8000-0000000008${String(history.length).padStart(2, '0')}`,
    actor: userRef(state, state.user?.id ?? ''),
    createdAt: requestTime,
    ...change,
  } as IssueActivity);
  state.activities.set(key, history);
}

/**
 * `POST /api/v1/projects/:key/issues`: the next number, the defaults, its reporter the caller; a
 * person property given or required only of those who `mayName`.
 */
function createIssue(
  state: FakeServerState,
  project: FakeProject,
  fields: Record<string, unknown>,
  mayName: boolean,
): Response {
  const number =
    Math.max(
      0,
      ...state.issues
        .filter((issue) => issue.projectKey === project.key)
        .map((issue) => issue.number),
    ) + 1;
  const settings = fieldSettingsOf(project);
  if (settings.category.required && !fields['categoryId']) {
    return apiError(400, 'CATEGORY_REQUIRED');
  }
  if (settings.priority.required && !fields['priorityId']) {
    return apiError(400, 'PRIORITY_REQUIRED');
  }
  const values = (fields['properties'] ?? {}) as Record<string, unknown>;
  const properties = effectiveOf(state, project.key);
  if (!mayName && properties.some(({ id, type }) => type === 'user' && id in values)) {
    return apiError(403, 'FORBIDDEN');
  }
  const given = creationValuesOf(
    properties.filter(({ type }) => mayName || type !== 'user').map(rulesOf),
    values,
  );
  if ('problem' in given) {
    return apiError(400, PROPERTY_REFUSALS[given.problem]);
  }
  const issue = fakeIssue(project.key, number, String(fields['title']).trim(), {
    properties: given.values,
    description: String(fields['description'] ?? ''),
    ...(fields['categoryId'] ? { categoryId: String(fields['categoryId']) } : {}),
    ...(fields['priorityId'] ? { priorityId: String(fields['priorityId']) } : {}),
    reporterId: state.user?.id ?? '',
    createdAt: new Date().toISOString(),
  });
  state.issues.push(issue);
  record(state, keyOf(issue), { type: 'issue.created', payload: {} });
  return json(
    {
      id: `01a1569b-9900-7000-8000-0000000007${String(number).padStart(2, '0')}`,
      key: keyOf(issue),
    },
    201,
  );
}

const ISSUE_PATH =
  /^\/api\/v1\/issues\/([^/]+)(?:\/(status|assignee|labels|properties|following|duplicate-of|activities|comments|mentionable)(?:\/([^/]+))?)?$/;

/** An issue the signed-in user sees, with its project and what they may do there. */
interface SeenIssue {
  issue: FakeIssue;
  project: FakeProject;
  permissions: ProjectPermission[];
  actions: ReturnType<typeof issueActionsOf>;
}

/** The issue with `key` as the server finds it, or its refusal: one out of sight does not exist. */
function seenIssue(state: FakeServerState, key: string): SeenIssue | Response {
  const issue = state.issues.find((candidate) => keyOf(candidate) === key);
  const project = state.projects.find((candidate) => candidate.key === issue?.projectKey);
  const permissions = project ? projectPermissionsFor(state, project) : null;
  const reported = issue?.reporterId === state.user?.id;
  if (!(issue && project && permissions && canSeeIssue(permissions, reported))) {
    return asSignedIn(state) ?? apiError(404, 'ISSUE_NOT_FOUND');
  }
  // Read-only while archived: nothing to offer.
  const actions = project.archived ? [] : issueActionsOf(permissions, reported);
  return { issue, project, permissions, actions };
}

/** The issue with `key` as the signed-in user may know it: its key and title, or `null`s. */
function linkedIssue(state: FakeServerState, key: string): LinkedIssue {
  const seen = seenIssue(state, key);
  return seen instanceof Response ? { key: null, title: null } : { key, title: seen.issue.title };
}

/** The issue it duplicates and its own duplicates, as the signed-in user may know them. */
function duplicatesAround(
  state: FakeServerState,
  issue: FakeIssue,
): Pick<IssueResponse, 'duplicateOf' | 'duplicates' | 'duplicateCount'> {
  const duplicates = state.issues.flatMap((candidate) => {
    const seen =
      candidate.duplicateOfKey === keyOf(issue) ? seenIssue(state, keyOf(candidate)) : null;
    return seen && !(seen instanceof Response) ? [seen.issue] : [];
  });
  const original = issue.duplicateOfKey ? seenIssue(state, issue.duplicateOfKey) : null;
  // Marked, the original shows; out of the reader's sight, as nothing they could know.
  const hidden = issue.duplicateOfKey ? { key: null, title: null, status: null } : null;
  return {
    duplicateOf:
      original && !(original instanceof Response)
        ? {
            key: keyOf(original.issue),
            title: original.issue.title,
            status: summaryOf(state, original.issue).status,
          }
        : hidden,
    duplicates: duplicates.map((duplicate) => ({
      key: keyOf(duplicate),
      title: duplicate.title,
      status: summaryOf(state, duplicate).status,
    })),
    duplicateCount: duplicates.length,
  };
}

/**
 * `PUT /api/v1/issues/:key/duplicate-of`: the original seen and not looping back, the issue closed
 * in a closing status its workflow allows, the mark told.
 */
function markDuplicate(
  state: FakeServerState,
  issue: FakeIssue,
  fields: Record<string, unknown>,
): Response {
  const originalKey = String(fields['originalKey']);
  const statusId = String(fields['statusId']);
  if (seenIssue(state, originalKey) instanceof Response) {
    return apiError(400, 'ORIGINAL_NOT_FOUND');
  }
  let chain: string | null = originalKey;
  while (chain) {
    if (chain === keyOf(issue)) {
      return apiError(409, 'DUPLICATE_CYCLE');
    }
    const next: string | null = chain;
    chain = state.issues.find((candidate) => keyOf(candidate) === next)?.duplicateOfKey ?? null;
  }
  const closing = issueFields(state, issue.projectKey).statuses.find(({ id }) => id === statusId);
  if (!closing?.closes) {
    return apiError(409, 'STATUS_NOT_ALLOWED');
  }
  if (issue.statusId !== statusId && moveIssue(state, issue, statusId).status === 409) {
    return apiError(409, 'STATUS_NOT_ALLOWED');
  }
  record(state, keyOf(issue), {
    type: 'issue.duplicateChanged',
    payload: {
      from: issue.duplicateOfKey ? linkedIssue(state, issue.duplicateOfKey) : null,
      to: linkedIssue(state, originalKey),
    },
  });
  issue.duplicateOfKey = originalKey;
  return NO_CONTENT();
}

/** Whether the signed-in user follows the issue (`followersOf`). */
function followingOf(state: FakeServerState, issue: FakeIssue): Pick<IssueResponse, 'following'> {
  const choices = Object.entries(issue.followers);
  const followers = followersOf({
    reporterId: issue.reporterId,
    assigneeId: issue.assigneeId,
    commenterIds: (state.activities.get(keyOf(issue)) ?? []).flatMap((entry) =>
      entry.type === 'issue.commented' ? [entry.actor.id] : [],
    ),
    followerIds: choices.filter(([, following]) => following).map(([userId]) => userId),
    unfollowerIds: choices.filter(([, following]) => !following).map(([userId]) => userId),
  });
  return {
    following: state.user !== null && followers.includes(state.user.id),
  };
}

/** `/api/v1/issues/:key` and what hangs off it, with the server's rules. */
function issueRequest(
  state: FakeServerState,
  method: string,
  path: string,
  search: URLSearchParams,
  body: unknown,
): Response | undefined {
  const match = ISSUE_PATH.exec(path);
  if (!match) {
    return undefined;
  }
  const [, key = '', part = '', commentId] = match;
  const seen = seenIssue(state, key);
  if (seen instanceof Response) {
    return seen;
  }
  if (method !== 'GET' && seen.project.archived) {
    return apiError(409, 'PROJECT_ARCHIVED');
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const { issue, project, permissions, actions } = seen;
  const unless = (permission: ProjectPermission, answer: () => Response) =>
    can(permissions, permission) ? answer() : apiError(403, 'FORBIDDEN');
  switch (`${method} ${part}`) {
    case 'GET ':
      return json({
        ...summaryOf(state, issue),
        properties: propertyValuesOf(state, issue, { listedOnly: false }),
        id: '01a1569b-9900-7000-8000-000000000700',
        project: { key: project.key, name: project.name },
        description: issue.description,
        closedAt: issue.closedAt,
        actions,
        ...followingOf(state, issue),
        ...duplicatesAround(state, issue),
      } satisfies IssueResponse);
    case 'PATCH ':
      return updateIssue(state, issue, actions, fields);
    case 'PUT status':
      return unless('issue.update', () => moveIssue(state, issue, String(fields['statusId'])));
    case 'PUT labels':
      return unless('issue.update', () => setLabels(state, issue, fields));
    case 'PUT properties':
      return unless('issue.update', () =>
        setProperty(state, issue, commentId ?? '', fields, can(permissions, 'issue.assign')),
      );
    case 'PUT duplicate-of':
      return unless('issue.update', () => markDuplicate(state, issue, fields));
    case 'DELETE duplicate-of':
      return unless('issue.update', () => {
        if (issue.duplicateOfKey) {
          record(state, keyOf(issue), {
            type: 'issue.duplicateChanged',
            payload: { from: linkedIssue(state, issue.duplicateOfKey), to: null },
          });
          issue.duplicateOfKey = null;
        }
        return NO_CONTENT();
      });
    case 'PUT following': {
      const request = issueFollowingRequestSchema.safeParse(body);
      if (!(request.success && state.user)) {
        return apiError(400, 'VALIDATION_ERROR');
      }
      issue.followers[state.user.id] = request.data.following;
      return NO_CONTENT();
    }
    case 'PUT assignee':
      return unless('issue.assign', () =>
        assignIssue(state, issue, (fields['assigneeId'] as string | null | undefined) ?? null),
      );
    case 'DELETE ':
      return unless('issue.delete', () => {
        state.issues = state.issues.filter((candidate) => candidate !== issue);
        return NO_CONTENT();
      });
    case 'GET activities': {
      const history = (state.activities.get(key) ?? []).flatMap((entry) =>
        shownInHistory(state, entry, seen),
      );
      return json({
        // Newest first; a stable sort keeps changes made together in the order they were made.
        rows: history.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)),
        matching: history.length,
        page: Number(search.get('page') ?? '1'),
        pageSize: 50,
      });
    }
    case 'GET mentionable':
      return unless('comment.create', () => {
        const needle = fold(search.get('search') ?? '');
        return json({
          people: state.users
            .filter((user) => !user.deactivatedAt && user.id !== state.user?.id)
            .filter((user) => accessReason(state, project, user) !== null)
            .filter(({ name }) => fold(name).includes(needle))
            .map(({ id, name, role }) => ({ id, name, role })),
        });
      });
    case 'POST comments':
    case 'PATCH comments':
    case 'DELETE comments':
      return commentRequest(state, key, method, commentId, fields, seen);
    default:
      return apiError(404, 'NOT_FOUND');
  }
}

/**
 * A step of the history as the signed-in user sees it, as the server says: a comment with its
 * files and what they may do on them; a file of the request while it is there.
 */
function shownInHistory(
  state: FakeServerState,
  entry: IssueActivity,
  seen: SeenIssue,
): IssueActivity[] {
  const { issue, project, permissions } = seen;
  if (entry.type === 'issue.attachmentAdded') {
    const file = state.attachments.find(({ id }) => id === entry.payload.attachment.id);
    return file ? [{ ...entry, payload: { attachment: shownAttachment(state, file, seen) } }] : [];
  }
  if (entry.type !== 'issue.commented') {
    return [entry];
  }
  const { comment } = entry.payload;
  const actions = project.archived
    ? []
    : commentActionsOf(permissions, entry.actor.id === state.user?.id);
  const attachments = state.attachments
    .filter(({ issueKey, commentId }) => issueKey === keyOf(issue) && commentId === comment.id)
    .map((file) => shownAttachment(state, file, seen));
  return [{ ...entry, payload: { comment: { ...comment, attachments, actions } } }];
}

/** Where a file is, as the rights to it read it. */
function placeOf(
  state: FakeServerState,
  file: FakeAttachment,
  { issue }: SeenIssue,
): AttachmentPlace {
  if (file.commentId === null) {
    return { on: 'request', reportedByThem: issue.reporterId === state.user?.id };
  }
  const comment = (state.activities.get(file.issueKey) ?? []).find(
    (entry) => entry.type === 'issue.commented' && entry.payload.comment.id === file.commentId,
  );
  return { on: 'comment', writtenByThem: comment?.actor.id === state.user?.id };
}

/** A file with what the signed-in user may do on it. */
function shownAttachment(
  state: FakeServerState,
  file: FakeAttachment,
  seen: SeenIssue,
): IssueAttachment {
  const actions = seen.project.archived
    ? []
    : attachmentActionsOf(
        seen.permissions,
        placeOf(state, file, seen),
        file.uploaderId === state.user?.id,
      );
  const { id, fileName, mediaType, size } = file;
  return { id, fileName, mediaType, size, actions };
}

const ATTACHMENT_PATH =
  /^\/api\/v1\/issues\/([^/]+)(?:\/comments\/([^/]+))?\/attachments(?:\/([^/]+)(?:\/(download|preview))?)?$/;

/**
 * `/api/v1/issues/:key[/comments/:commentId]/attachments[/:id]`: files listed, sent, removed,
 * with the server's rules; the type a file's name announces is checked against its content.
 */
function attachmentRequest(
  state: FakeServerState,
  method: string,
  path: string,
  body: unknown,
  headers: Headers,
): Response | Promise<Response> | undefined {
  const match = ATTACHMENT_PATH.exec(path);
  if (!match) {
    return undefined;
  }
  const [, key = '', commentId, attachmentId, file] = match;
  const seen = seenIssue(state, key);
  if (seen instanceof Response) {
    return seen;
  }
  if (method !== 'GET' && seen.project.archived) {
    return apiError(409, 'PROJECT_ARCHIVED');
  }
  const ofIssue = state.attachments.filter(({ issueKey }) => issueKey === key);
  const found = ofIssue.find(({ id }) => id === attachmentId);
  if (method === 'GET' && attachmentId === undefined) {
    return json({
      rows: ofIssue
        .filter((attachment) => attachment.commentId === null)
        .map((attachment) => shownAttachment(state, attachment, seen)),
    });
  }
  if (method === 'POST' && attachmentId === undefined && body instanceof Blob) {
    return addAttachment(state, seen, commentId ?? null, body, headers.get(FILE_NAME_HEADER));
  }
  if (!found) {
    return apiError(404, 'ATTACHMENT_NOT_FOUND');
  }
  if (method === 'GET' && file) {
    return new Response(new Blob([found.content]), { status: 200 });
  }
  if (method === 'DELETE' && !file) {
    return removeAttachment(state, found, seen);
  }
  return apiError(404, 'NOT_FOUND');
}

/** `DELETE …/attachments/:id`: by whoever may remove that file, for good. */
function removeAttachment(
  state: FakeServerState,
  found: FakeAttachment,
  seen: SeenIssue,
): Response {
  const allowed = attachmentActionsOf(
    seen.permissions,
    placeOf(state, found, seen),
    found.uploaderId === state.user?.id,
  );
  if (!allowed.includes('delete')) {
    return apiError(403, 'FORBIDDEN');
  }
  state.attachments = state.attachments.filter((attachment) => attachment !== found);
  return NO_CONTENT();
}

/** `POST …/attachments`: who may attach files there, the name cleaned, the content checked. */
async function addAttachment(
  state: FakeServerState,
  seen: SeenIssue,
  commentId: string | null,
  content: Blob,
  encodedName: string | null,
): Promise<Response> {
  const key = keyOf(seen.issue);
  const comment = (state.activities.get(key) ?? []).find(
    (entry) => entry.type === 'issue.commented' && entry.payload.comment.id === commentId,
  );
  if (commentId !== null && !comment) {
    return apiError(404, 'COMMENT_NOT_FOUND');
  }
  const place: AttachmentPlace = comment
    ? { on: 'comment', writtenByThem: comment.actor.id === state.user?.id }
    : { on: 'request', reportedByThem: seen.issue.reporterId === state.user?.id };
  if (!canAttachTo(seen.permissions, place)) {
    return apiError(403, 'FORBIDDEN');
  }
  const fileName = cleanFileName(decodeURIComponent(encodedName ?? ''));
  if (fileName === null) {
    return apiError(400, 'INVALID_FILE_NAME');
  }
  if (content.size > state.attachmentMaxSize) {
    return apiError(413, 'ATTACHMENT_TOO_LARGE');
  }
  const bytes = new Uint8Array(await content.arrayBuffer());
  const textScan = createTextScan();
  textScan.push(bytes);
  const type = mediaTypeOf(fileName, {
    head: bytes.subarray(0, FILE_HEAD_LENGTH),
    text: textScan.end(),
  });
  if ('problem' in type) {
    return apiError(
      415,
      type.problem === 'typeNotAllowed'
        ? 'ATTACHMENT_TYPE_NOT_ALLOWED'
        : 'ATTACHMENT_CONTENT_MISMATCH',
    );
  }
  const held = state.attachments.filter(
    (attachment) => attachment.issueKey === key && attachment.commentId === commentId,
  );
  if (held.length >= ATTACHMENTS_MAX) {
    return apiError(409, 'TOO_MANY_ATTACHMENTS');
  }
  const attachment = fakeAttachment(state.attachments.length + 50, fileName, type.mediaType, {
    issueKey: key,
    commentId,
    size: content.size,
    uploaderId: state.user?.id ?? '',
    content: bytes,
  });
  state.attachments.push(attachment);
  if (commentId === null) {
    record(state, key, {
      type: 'issue.attachmentAdded',
      payload: { attachment: shownAttachment(state, attachment, seen) },
    });
  }
  return json({ id: attachment.id }, 201);
}

/**
 * `/api/v1/issues/:key/comments[/:commentId]`: kept in the history, as the server reads them.
 * Its author edits a comment; its author or a moderator deletes it, leaving no trace.
 */
function commentRequest(
  state: FakeServerState,
  key: string,
  method: string,
  commentId: string | undefined,
  fields: Record<string, unknown>,
  { permissions }: SeenIssue,
): Response {
  const history = state.activities.get(key) ?? [];
  if (method === 'POST') {
    const body = commentRequestSchema.safeParse(fields);
    if (!can(permissions, 'comment.create')) {
      return apiError(403, 'FORBIDDEN');
    }
    if (!body.success) {
      return apiError(400, 'VALIDATION_FAILED');
    }
    const id = `01a1569b-9900-7000-8000-0000000009${String(history.length).padStart(2, '0')}`;
    record(state, key, {
      type: 'issue.commented',
      payload: {
        comment: {
          id,
          body: body.data.body,
          editedAt: null,
          attachments: [],
          mentions: body.data.mentions.map((named) => userRef(state, named)),
          actions: [],
        },
      },
    });
    return json({ id }, 201);
  }
  const entry = history.find(
    (candidate) =>
      candidate.type === 'issue.commented' && candidate.payload.comment.id === commentId,
  );
  if (entry?.type !== 'issue.commented') {
    return apiError(404, 'COMMENT_NOT_FOUND');
  }
  const allowed = commentActionsOf(permissions, entry.actor.id === state.user?.id);
  if (method === 'DELETE') {
    if (!allowed.includes('delete')) {
      return apiError(403, 'FORBIDDEN');
    }
    state.activities.set(
      key,
      history.filter((candidate) => candidate !== entry),
    );
    return NO_CONTENT();
  }
  const body = commentRequestSchema.safeParse(fields);
  if (!allowed.includes('edit')) {
    return apiError(403, 'FORBIDDEN');
  }
  if (!body.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const { mentions } = entry.payload.comment;
  const named = body.data.mentions.filter((id) => !mentions.some((person) => person.id === id));
  entry.payload.comment = {
    ...entry.payload.comment,
    body: body.data.body,
    editedAt: new Date().toISOString(),
    mentions: [...mentions, ...named.map((id) => userRef(state, id))],
  };
  return NO_CONTENT();
}

function assignIssue(state: FakeServerState, issue: FakeIssue, to: string | null): Response {
  record(state, keyOf(issue), {
    type: 'issue.assigneeChanged',
    payload: {
      from: issue.assigneeId ? userRef(state, issue.assigneeId) : null,
      to: to ? userRef(state, to) : null,
    },
  });
  issue.assigneeId = to;
  return NO_CONTENT();
}

function updateIssue(
  state: FakeServerState,
  issue: FakeIssue,
  actions: readonly string[],
  fields: Record<string, unknown>,
): Response {
  const text = (name: string) => (typeof fields[name] === 'string' ? fields[name] : undefined);
  const changes = issueChanges(issue, {
    title: text('title'),
    description: text('description'),
    categoryId: text('categoryId'),
    priorityId: text('priorityId'),
  });
  if (actionsFor(changes).some((action) => !actions.includes(action))) {
    return apiError(403, 'FORBIDDEN');
  }
  const named = issueFields(state, issue.projectKey);
  for (const { field, from, to } of changes) {
    issue[field] = to;
    const key = keyOf(issue);
    if (field === 'title' || field === 'description') {
      record(state, key, {
        type: field === 'title' ? 'issue.titleChanged' : 'issue.descriptionChanged',
        payload: { from, to },
      });
    } else if (field === 'categoryId') {
      const name = (id: string) => ({
        id,
        name: named.categories.find((category) => category.id === id)?.name ?? '',
      });
      record(state, key, {
        type: 'issue.categoryChanged',
        payload: { from: name(from), to: name(to) },
      });
    } else {
      const level = (id: string) => named.priorities.find((priority) => priority.id === id);
      const ref = (id: string) => ({
        id,
        name: level(id)?.name ?? '',
        level: level(id)?.level ?? 2,
      });
      record(state, key, {
        type: 'issue.priorityChanged',
        payload: { from: ref(from), to: ref(to) },
      });
    }
  }
  return NO_CONTENT();
}

/** `PUT /api/v1/issues/:key/status`: only where the workflow goes from the current status. */
function moveIssue(state: FakeServerState, issue: FakeIssue, statusId: string): Response {
  const statuses = issueFields(state, issue.projectKey).statuses;
  if (!canMoveTo(movesOf(workflowOf(state, issue.projectKey)), issue.statusId, statusId)) {
    return apiError(409, 'STATUS_NOT_ALLOWED');
  }
  const from = statuses.find(({ id }) => id === issue.statusId);
  const to = statuses.find(({ id }) => id === statusId);
  record(state, keyOf(issue), {
    type: 'issue.statusChanged',
    payload: {
      from: { id: issue.statusId, name: from?.name ?? '' },
      to: { id: statusId, name: to?.name ?? '' },
    },
  });
  issue.statusId = statusId;
  issue.closedAt = to?.closes ? (issue.closedAt ?? new Date().toISOString()) : null;
  return NO_CONTENT();
}

/** The properties a project's issues take, as the server works them out (`effectiveProperties`). */
function effectiveOf(state: FakeServerState, projectKey: string): FakeProperty[] {
  const options = state.properties.flatMap((property) =>
    property.options.map((option) => ({ ...option, propertyId: property.id, projectId: null })),
  );
  const own = state.propertyAdaptations.flatMap((adaptation) =>
    adaptation.projectKey === projectKey && adaptation.options
      ? adaptation.options.map((option) => ({
          ...option,
          propertyId: adaptation.propertyId,
          projectId: projectKey,
        }))
      : [],
  );
  return effectiveProperties(
    projectKey,
    state.properties.map((property) => ({ ...property, projectId: property.projectKey ?? null })),
    [...options, ...own],
    state.propertyAdaptations
      .filter((adaptation) => adaptation.projectKey === projectKey)
      .map(({ propertyId, hidden, options: ownOptions }) => ({
        propertyId,
        hidden,
        ownOptions: ownOptions !== null,
      })),
  ).map(({ projectId: _, options: shown, ...property }) => ({
    ...property,
    options: shown.map(({ id, name, color }) => ({ id, name, color })),
  }));
}

/** How a project adapts the category and the priority, all as they are unless said otherwise. */
function fieldSettingsOf(project: FakeProject | undefined): ProjectFields {
  return (
    project?.fieldSettings ?? {
      category: { hidden: false, required: false },
      priority: { hidden: false, required: false },
    }
  );
}

/** `PUT /api/v1/issues/:key/properties/:propertyId`: a value of the property, or none. */
function setProperty(
  state: FakeServerState,
  issue: FakeIssue,
  propertyId: string,
  fields: Record<string, unknown>,
  mayName: boolean,
): Response {
  const property = effectiveOf(state, issue.projectKey).find(({ id }) => id === propertyId);
  if (!property) {
    return apiError(404, 'PROPERTY_NOT_FOUND');
  }
  if (property.type === 'user' && !mayName) {
    return apiError(403, 'FORBIDDEN');
  }
  const given = fields['value'] ?? null;
  const taken = given === null ? { value: null } : propertyValueOf(rulesOf(property), given);
  if ('problem' in taken) {
    return apiError(400, PROPERTY_REFUSALS[taken.problem]);
  }
  const current = issue.properties[propertyId] ?? null;
  if (samePropertyValue(current, taken.value)) {
    return NO_CONTENT();
  }
  issue.properties = withPropertyValue(issue.properties, propertyId, taken.value);
  record(state, keyOf(issue), {
    type: 'issue.propertyChanged',
    payload: shownChange(state, property, current, taken.value),
  });
  return NO_CONTENT();
}

/** `/api/v1/properties[/:id]`: the instance's properties, as the settings edit them. */
function propertyRequest(
  state: FakeServerState,
  method: string,
  path: string,
  body: unknown,
): Response | undefined {
  const match = /^\/api\/v1\/properties(?:\/([^/]+))?$/.exec(path);
  if (!match) {
    return undefined;
  }
  const refusal = asHolder(state, 'instance.settings.manage');
  if (refusal) {
    return refusal;
  }
  const [, propertyId] = match;
  if (propertyId === undefined) {
    return method === 'POST'
      ? createFakeProperty(state, body, undefined)
      : listFakeProperties(state, undefined);
  }
  return changeFakeProperty(state, method, propertyId, body, undefined);
}

/**
 * `/api/v1/projects/:key/properties[/:id[/adaptation]]` and `/api/v1/projects/:key/fields`: how a
 * project adapts the category, the priority and the instance's properties, and its own.
 */
function projectPropertyRequest(
  state: FakeServerState,
  project: FakeProject,
  method: string,
  part: string,
  propertyId: string,
  sub: string,
  body: unknown,
): Response {
  if (part === 'fields') {
    const parsed = projectFieldsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_FAILED');
    }
    project.fieldSettings = parsed.data;
    return NO_CONTENT();
  }
  if (propertyId === '') {
    return method === 'POST'
      ? createFakeProperty(state, body, project.key)
      : json({
          fields: fieldSettingsOf(project),
          instance: listedRows(state, undefined, project.key).map((row) => {
            const adaptation = state.propertyAdaptations.find(
              (candidate) =>
                candidate.projectKey === project.key && candidate.propertyId === row.id,
            );
            return {
              ...row,
              hidden: adaptation?.hidden ?? false,
              ownOptions: Boolean(adaptation?.options),
            };
          }),
          own: listedRows(state, project.key, project.key),
        });
  }
  if (sub === 'adaptation') {
    return adaptFakeProperty(state, project.key, propertyId, body);
  }
  return changeFakeProperty(state, method, propertyId, body, project.key);
}

/**
 * The properties of the instance or of a project, each, and each option, counted in
 * `countedIn`'s issues.
 */
function listedRows(
  state: FakeServerState,
  projectKey: string | undefined,
  countedIn: string | undefined,
) {
  const counted = state.issues.filter(
    (issue) => countedIn === undefined || issue.projectKey === countedIn,
  );
  return state.properties
    .filter((property) => property.projectKey === projectKey)
    .map(({ projectKey: _, ...property }) => {
      const adaptation = state.propertyAdaptations.find(
        (candidate) => candidate.projectKey === countedIn && candidate.propertyId === property.id,
      );
      return {
        ...property,
        issueCount: counted.filter((issue) => property.id in issue.properties).length,
        options: (adaptation?.options ?? property.options).map((option) => ({
          ...option,
          issueCount: counted.filter((issue) => {
            const value = issue.properties[property.id];
            return value === option.id || (Array.isArray(value) && value.includes(option.id));
          }).length,
        })),
      };
    });
}

function listFakeProperties(state: FakeServerState, projectKey: string | undefined): Response {
  return json({ properties: listedRows(state, projectKey, undefined) });
}

function createFakeProperty(
  state: FakeServerState,
  body: unknown,
  projectKey: string | undefined,
): Response {
  const parsed = createPropertyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const clash = state.properties.some(
    (property) =>
      fold(property.name) === fold(parsed.data.name) &&
      (projectKey === undefined ||
        property.projectKey === undefined ||
        property.projectKey === projectKey),
  );
  if (clash) {
    return apiError(409, 'PROPERTY_NAME_TAKEN');
  }
  const property = fakeProperty(
    state.properties.length + 1,
    parsed.data.name,
    parsed.data.options.map(({ name }) => name),
    {
      type: parsed.data.type,
      shownInList: parsed.data.shownInList,
      askedAtCreation: parsed.data.askedAtCreation,
      required: parsed.data.required,
      ...(projectKey ? { projectKey } : {}),
    },
  );
  state.properties.push({
    ...property,
    options: property.options.map((option, index) => ({
      ...option,
      color: parsed.data.options[index]?.color ?? option.color,
    })),
  });
  return json({ id: property.id }, 201);
}

/** Saves or deletes a property of the instance (`projectKey` undefined) or of a project. */
function changeFakeProperty(
  state: FakeServerState,
  method: string,
  propertyId: string,
  body: unknown,
  projectKey: string | undefined,
): Response {
  const property = state.properties.find(
    ({ id, projectKey: owner }) => id === propertyId && owner === projectKey,
  );
  if (!property) {
    return apiError(404, 'PROPERTY_NOT_FOUND');
  }
  if (method === 'DELETE') {
    for (const issue of state.issues) {
      const value = issue.properties[property.id];
      if (value !== undefined) {
        issue.properties = withPropertyValue(issue.properties, property.id, null);
        record(state, keyOf(issue), {
          type: 'issue.propertyChanged',
          payload: shownChange(state, property, value, null),
        });
      }
    }
    state.properties = state.properties.filter((candidate) => candidate !== property);
    return NO_CONTENT();
  }
  const parsed = updatePropertyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const { options, removed, ...fields } = parsed.data;
  takeFakeOptionsOff(state, property.id, removed);
  const saved: FakeProperty = { ...property, ...fields, options: optionsFrom(options) };
  state.properties = state.properties.map((candidate) =>
    candidate === property ? saved : candidate,
  );
  return NO_CONTENT();
}

/** `PUT …/properties/:id/adaptation`: hidden in the project, and its own options or none. */
function adaptFakeProperty(
  state: FakeServerState,
  projectKey: string,
  propertyId: string,
  body: unknown,
): Response {
  const parsed = propertyAdaptationRequestSchema.safeParse(body);
  const property = state.properties.find(
    ({ id, projectKey: owner }) => id === propertyId && owner === undefined,
  );
  if (!property) {
    return apiError(404, 'PROPERTY_NOT_FOUND');
  }
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_FAILED');
  }
  const current = state.propertyAdaptations.find(
    (adaptation) => adaptation.projectKey === projectKey && adaptation.propertyId === propertyId,
  );
  const removed =
    parsed.data.options === null
      ? (current?.options ?? []).map(({ id }) => id)
      : parsed.data.options.removed;
  takeFakeOptionsOff(state, propertyId, removed, projectKey);
  const adaptation: FakeAdaptation = {
    projectKey,
    propertyId,
    hidden: parsed.data.hidden,
    options: parsed.data.options === null ? null : optionsFrom(parsed.data.options.options),
  };
  state.propertyAdaptations = [
    ...state.propertyAdaptations.filter((candidate) => candidate !== current),
    adaptation,
  ];
  return NO_CONTENT();
}

/** Saved options, a new one given a made-up id. */
function optionsFrom(
  options: readonly { id?: string | undefined; name: string; color: PaletteColor }[],
): PropertyOptionRef[] {
  return options.map(({ id, name, color }, index) => ({
    id: id ?? `01a1569b-9900-7000-8000-0000000013${String(index).padStart(2, '0')}`,
    name,
    color,
  }));
}

/**
 * Takes options off the issues choosing them, of one project or every one, each told in its
 * history: a list loses its value, a multi-select keeps its other options.
 */
function takeFakeOptionsOff(
  state: FakeServerState,
  propertyId: string,
  optionIds: readonly string[],
  projectKey?: string,
): void {
  const property = state.properties.find(({ id }) => id === propertyId);
  if (!property || optionIds.length === 0) {
    return;
  }
  for (const issue of state.issues) {
    const value = issue.properties[propertyId];
    const inScope = projectKey === undefined || issue.projectKey === projectKey;
    const kept = value === undefined ? null : withoutOptions(property.type, value, optionIds);
    if (value !== undefined && inScope && !samePropertyValue(value, kept)) {
      issue.properties = withPropertyValue(issue.properties, propertyId, kept);
      record(state, keyOf(issue), {
        type: 'issue.propertyChanged',
        payload: shownChange(state, property, value, kept),
      });
    }
  }
}
