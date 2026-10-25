import type { Db } from '@toppo/db';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import {
  type Access,
  assertAccess,
  isProjectAccess,
  type ProjectAccessRule,
} from '../auth/access-control.ts';
import type { Actor } from '../auth/actor.ts';
import {
  type IssueProjectContext,
  type ProjectContext,
  projectKeyIn,
  resolveIssue,
  resolveProject,
} from '../auth/project-access.ts';
import type { SecretBox } from '../config/secret-box.ts';
import { HttpError } from '../http/http-error.ts';
import { RequestValidationError } from '../http/zod.ts';
import type { Mailer } from '../mail/mailer.ts';
import type { ReleaseFeed } from '../updates/release-feed.ts';
import type { FileStorage } from '../uploads/file-storage.ts';

/** The transaction a command runs in. */
export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Capabilities and settings commands may need besides the database. Built once in `app.ts`. */
export interface Services {
  /** Hashes a password exactly as Better Auth verifies it. */
  hashPassword(password: string): Promise<string>;
  /** First-run code accepted by the setup wizard (printed in the logs or `TOPPO_SETUP_CODE`). */
  setupCode: string;
  /** Where users reach Toppo (`TOPPO_URL`), to build links they open, such as invitations. */
  publicUrl: URL;
  /** Attached files on disk: a command keeps a received file there, under a random key. */
  files: Pick<FileStorage, 'keep' | 'maxFileSize'>;
  /** Seals what must not be kept in clear in the database, such as the mail password. */
  secrets: SecretBox;
  /** Sends email with the settings saved by an administrator. */
  mailer: Mailer;
  /** The versions of Toppo published, unless the instance does not look (`TOPPO_UPDATE_CHECK`). */
  releases: ReleaseFeed;
}

/** What every command and query runs with: per HTTP request today, per plugin call later. */
export interface ExecutionContext {
  db: Db;
  actor: Actor | null;
  log: FastifyBaseLogger;
  services: Services;
  /**
   * The project (and issue) an HTTP route already checked the actor's access to, before reading
   * the body.
   */
  project?: ProjectContext | IssueProjectContext | null;
}

/** Who runs an operation: possibly nobody when it is public, a signed-in user otherwise. */
export type ActorOf<A> = A extends 'public' ? Actor | null : Actor;

/** The project an operation is about when its access names one, with the issue it names, if any. */
export type ProjectOf<A> = A extends { project: 'issueKey' }
  ? IssueProjectContext
  : A extends { project: string }
    ? ProjectContext
    : undefined;

interface Scope<A> {
  actor: ActorOf<A>;
  project: ProjectOf<A>;
  log: FastifyBaseLogger;
  services: Services;
}

/** A command reads and writes through `tx` only: everything it does commits or rolls back together. */
export interface CommandScope<A = Access> extends Scope<A> {
  tx: Transaction;
}

/** A query reads through `db` and never writes. */
export interface QueryScope<A = Access> extends Scope<A> {
  db: Db;
}

interface Definition<Input extends z.ZodType, A extends Access<z.output<Input>>> {
  /** `resource.action`, used in logs: `setup.complete`, `issue.create`. */
  name: string;
  /** Checked before anything else; the route running the operation declares the same. */
  access: A;
  /** Validated on every call, including from callers other than HTTP routes. */
  input: Input;
}

export interface CommandDefinition<
  Input extends z.ZodType,
  Output,
  A extends Access<z.output<Input>>,
> extends Definition<Input, A> {
  handler(scope: CommandScope<A>, input: z.output<Input>): Promise<Output>;
}

export interface QueryDefinition<Input extends z.ZodType, Output, A extends Access<z.output<Input>>>
  extends Definition<Input, A> {
  handler(scope: QueryScope<A>, input: z.output<Input>): Promise<Output>;
}

export interface Operation<Input extends z.ZodType, Output> {
  name: string;
  /** For the route's `config.access`, so the route and the operation cannot disagree. */
  access: Access;
  execute(context: ExecutionContext, input: z.input<Input>): Promise<Output>;
}

/**
 * A state change: access checked, input validated, then the handler runs in one transaction.
 * Return at most what the caller needs to go on (an id), not a read model: that is a query's job.
 * An archived project is read-only: commands on it are refused, unless their access says otherwise.
 */
export function defineCommand<Input extends z.ZodType, Output, A extends Access<z.output<Input>>>(
  definition: CommandDefinition<Input, Output, A>,
): Operation<Input, Output> {
  return {
    name: definition.name,
    access: definition.access,
    async execute(context, rawInput) {
      const { actor, input, project } = await prepare(definition, context, rawInput);
      const { access } = definition;
      if (project?.archived && isProjectAccess(access) && !access.evenArchived) {
        throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived: it is read-only');
      }
      const log = context.log.child({ command: definition.name });
      return await context.db.transaction((tx) =>
        definition.handler({ tx, actor, project, log, services: context.services }, input),
      );
    },
  };
}

/** A read: access checked, input validated, no transaction, no write. */
export function defineQuery<Input extends z.ZodType, Output, A extends Access<z.output<Input>>>(
  definition: QueryDefinition<Input, Output, A>,
): Operation<Input, Output> {
  return {
    name: definition.name,
    access: definition.access,
    async execute(context, rawInput) {
      const { actor, input, project } = await prepare(definition, context, rawInput);
      const log = context.log.child({ query: definition.name });
      return await definition.handler(
        { db: context.db, actor, project, log, services: context.services },
        input,
      );
    },
  };
}

/**
 * Access first: a caller without access learns nothing, not even what input is expected. Access
 * to a project needs the input that names it, so it comes right after.
 */
async function prepare<Input extends z.ZodType, A extends Access<z.output<Input>>>(
  definition: Definition<Input, A>,
  context: ExecutionContext,
  rawInput: unknown,
): Promise<{ actor: ActorOf<A>; input: z.output<Input>; project: ProjectOf<A> }> {
  assertAccess(definition.access, context.actor);
  const result = definition.input.safeParse(rawInput);
  if (!result.success) {
    const error = new RequestValidationError(result.error.issues);
    error.validationContext = 'input';
    throw error;
  }
  const { access } = definition;
  const project =
    isProjectAccess(access) && context.actor
      ? await projectOf(access, context, context.actor, result.data)
      : undefined;
  // assertAccess has just refused anonymous callers of every access but `public`, and `project`
  // is set exactly when the access names one.
  return {
    actor: context.actor as ActorOf<A>,
    input: result.data,
    project: project as ProjectOf<A>,
  };
}

async function projectOf<Input>(
  access: ProjectAccessRule<Input>,
  context: ExecutionContext,
  actor: Actor,
  input: Input,
): Promise<ProjectContext> {
  const field = Reflect.get(input as object, access.project);
  const value = typeof field === 'string' ? field : undefined;
  // The route has already checked this very project or issue, with the same access, before the body.
  const checked = context.project;
  if (access.project === 'issueKey') {
    return checked && 'issue' in checked && checked.issue.key === value
      ? checked
      : await resolveIssue(context.db, actor, value, access.permission);
  }
  const key = projectKeyIn(access.project, value);
  if (checked && checked.key === key) {
    return checked;
  }
  return await resolveProject(context.db, actor, key, access.permission);
}
