import { randomUUID } from 'node:crypto';
import type { Database } from '@toppo-tracker/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAccountRoutes } from './features/account/account.routes.ts';
import { registerAttachmentRoutes } from './features/attachments/attachments.routes.ts';
import { registerCategoryRoutes } from './features/categories/categories.routes.ts';
import { createComment } from './features/comments/commands/create-comment.command.ts';
import { registerCommentRoutes } from './features/comments/comments.routes.ts';
import { registerInvitationRoutes } from './features/invitations/invitations.routes.ts';
import { emailInvitationJob } from './features/invitations/jobs/email-invitation.job.ts';
import { registerIssueRoutes } from './features/issues/issues.routes.ts';
import { rebuildIssueWordsJob } from './features/issues/jobs/rebuild-issue-words.job.ts';
import { rebuildProjectWordsJob } from './features/issues/jobs/rebuild-project-words.job.ts';
import { getIssueSnapshot } from './features/issues/queries/get-issue-snapshot.query.ts';
import { registerLabelRoutes } from './features/labels/labels.routes.ts';
import { registerMailRoutes } from './features/mail/mail.routes.ts';
import { emailNotificationJob } from './features/notifications/jobs/email-notification.job.ts';
import { notifyActivityJob } from './features/notifications/jobs/notify-activity.job.ts';
import { pruneNotificationsJob } from './features/notifications/jobs/prune-notifications.job.ts';
import { registerNotificationRoutes } from './features/notifications/notifications.routes.ts';
import { deliverEventsJob } from './features/plugins/jobs/deliver-events.job.ts';
import { emailPluginDisabledJob } from './features/plugins/jobs/email-plugin-disabled.job.ts';
import { fanOutEventsJob } from './features/plugins/jobs/fan-out-events.job.ts';
import { sweepOnceKeysJob } from './features/plugins/jobs/sweep-once-keys.job.ts';
import { registerPluginRoutes } from './features/plugins/plugins.routes.ts';
import { registerPriorityRoutes } from './features/priorities/priorities.routes.ts';
import { registerProjectRoutes } from './features/projects/projects.routes.ts';
import { registerPropertyRoutes } from './features/properties/properties.routes.ts';
import { registerRoleRoutes } from './features/roles/roles.routes.ts';
import { registerSetupRoutes } from './features/setup/setup.routes.ts';
import { checkForUpdatesJob } from './features/updates/jobs/check-for-updates.job.ts';
import { registerUpdateRoutes } from './features/updates/updates.routes.ts';
import { registerUserRoutes } from './features/users/users.routes.ts';
import { registerWorkflowRoutes } from './features/workflows/workflows.routes.ts';
import { registerAccessControl } from './platform/auth/access-control.ts';
import type { Auth } from './platform/auth/auth.ts';
import { registerAuthRoutes } from './platform/auth/auth-routes.ts';
import { registerMeRoute } from './platform/auth/me-route.ts';
import { passwordResetMailJob } from './platform/auth/password-reset-mail.ts';
import { issueKeyOf } from './platform/auth/project-access.ts';
import type { Config } from './platform/config/config.ts';
import { createSecretBox } from './platform/config/secret-box.ts';
import type { Services } from './platform/cqrs/cqrs.ts';
import { registerExecutionContext } from './platform/cqrs/execution-context.ts';
import { registerHealthRoute } from './platform/health/health-route.ts';
import { registerErrorHandler } from './platform/http/error-handler.ts';
import { HttpError } from './platform/http/http-error.ts';
import { registerOriginCheck } from './platform/http/origin-check.ts';
import { pruneRateLimitsJob, registerRateLimit } from './platform/http/rate-limit.ts';
import { enforceRouteContracts } from './platform/http/route-contracts.ts';
import { registerSecurityHeaders } from './platform/http/security-headers.ts';
import { registerWebApp } from './platform/http/web-app.ts';
import { serializerCompiler, validatorCompiler } from './platform/http/zod.ts';
import type { RunnableJob } from './platform/jobs/jobs.ts';
import { createMailer } from './platform/mail/mailer.ts';
import { type HostCalls, orNullIfNotFound } from './platform/plugins/host-calls.ts';
import {
  createManifestReader,
  createSettingsChecker,
} from './platform/plugins/packages/manifest-reader.ts';
import { registerPackageRoutes } from './platform/plugins/packages/package-routes.ts';
import type { PackageStore } from './platform/plugins/packages/package-store.ts';
import { packageSweepJob } from './platform/plugins/packages/package-sweeper.ts';
import type { PluginRuntime } from './platform/plugins/runtime/plugin-runtime.ts';
import { createReleaseFeed } from './platform/updates/release-feed.ts';
import { registerFileRoutes } from './platform/uploads/file-routes.ts';
import type { FileStorage } from './platform/uploads/file-storage.ts';
import { fileSweepJob } from './platform/uploads/file-sweeper.ts';

export interface AppDependencies {
  config: Pick<Config, 'publicUrl' | 'logLevel' | 'trustProxy' | 'updateCheck'>;
  database: Pick<Database, 'db' | 'ping'>;
  auth: Auth;
  /** The instance's key (`TOPPO_SECRET` or generated): signs sessions, seals stored secrets. */
  secret: string;
  /** First-run code accepted by the setup wizard. */
  setupCode: string;
  /** Attached files, under `<dataDir>/uploads`. */
  files: FileStorage;
  plugins: {
    /** Plugins' zips, under `<dataDir>/plugins`. */
    packages: PackageStore;
    /** The script of a plugin's sandbox worker: from the sources, or built beside `main.js`. */
    workerUrl: URL;
    /** The sandboxes of this server process, closed with the app. */
    runtime: PluginRuntime;
  };
  /** Directory of the compiled web app. Not configurable: it ships inside the image. */
  webRoot: string;
}

const BODY_LIMIT_BYTES = 1024 * 1024;
/**
 * Long enough to attach 20 MB over a slow mobile connection; Node's own default. Slow headers
 * are still cut after a minute (`headersTimeout`).
 */
const REQUEST_TIMEOUT_MS = 300_000;

/**
 * What a plugin may ask Toppo, answered by the operations of the features that own each thing,
 * with their own checks: the plugin's access is the context's actor.
 */
export function createHostCalls(): HostCalls {
  return {
    'issues.get': async (context, { issueId }) => {
      const issueKey = await issueKeyOf(context.db, issueId);
      return issueKey === null
        ? null
        : await orNullIfNotFound(getIssueSnapshot.execute(context, { issueKey }));
    },
    'issues.comment': async (context, { issueId, body, once }) => {
      const issueKey = await issueKeyOf(context.db, issueId);
      if (issueKey === null) {
        throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
      }
      const created = await createComment.execute(context, {
        issueKey,
        body,
        ...(once === undefined ? {} : { once }),
      });
      return { commentId: created.id };
    },
  };
}

/** What commands and queries may use besides the database. */
export function createServices({
  auth,
  secret,
  setupCode,
  files,
  plugins,
  publicUrl,
  updateCheck,
}: Pick<AppDependencies, 'auth' | 'secret' | 'setupCode' | 'files' | 'plugins'> & {
  publicUrl: URL;
  updateCheck: boolean;
}): Services {
  const secrets = createSecretBox(secret);
  return {
    hashPassword: async (password) => (await auth.$context).password.hash(password),
    setupCode,
    publicUrl,
    files,
    secrets,
    mailer: createMailer(secrets),
    releases: createReleaseFeed({ enabled: updateCheck }),
    plugins: {
      packages: plugins.packages,
      readManifest: createManifestReader(plugins.workerUrl),
      checkSettings: createSettingsChecker(plugins.workerUrl),
      runtime: plugins.runtime,
      calls: createHostCalls(),
    },
  };
}

/** Every job the workers run: each server process runs one worker, `main.ts` starts it. */
export function createJobs({
  files,
  packages,
}: Pick<AppDependencies, 'files'> & { packages: PackageStore }): RunnableJob[] {
  return [
    fileSweepJob(files),
    packageSweepJob(packages),
    notifyActivityJob,
    pruneNotificationsJob,
    emailInvitationJob,
    passwordResetMailJob,
    emailNotificationJob,
    rebuildIssueWordsJob,
    rebuildProjectWordsJob,
    checkForUpdatesJob,
    pruneRateLimitsJob,
    fanOutEventsJob,
    deliverEventsJob,
    emailPluginDisabledJob,
    sweepOnceKeysJob,
  ];
}

/**
 * Behind a reverse proxy, the client is the address the proxy itself added: the last of
 * `X-Forwarded-For`. Only the proxy that connects to Toppo is trusted (hop 0), never what the
 * client wrote before it, which a proxy that appends (nginx's `$proxy_add_x_forwarded_for`) keeps.
 */
function trustTheProxyOnly(_address: string, hop: number): boolean {
  return hop === 0;
}

/** Builds the Fastify application without listening, so tests can drive it with `inject()`. */
export async function buildApp({
  config,
  database,
  auth,
  secret,
  setupCode,
  files,
  plugins,
  webRoot,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.trustProxy ? trustTheProxyOnly : false,
    bodyLimit: BODY_LIMIT_BYTES,
    requestTimeout: REQUEST_TIMEOUT_MS,
    // Never trust a client-provided request id: it ends up in logs.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  // Platform: contracts, security and request context, before any route.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  enforceRouteContracts(app);
  registerErrorHandler(app);
  await registerSecurityHeaders(app, { publicUrl: config.publicUrl });
  registerOriginCheck(app, { publicUrl: config.publicUrl });
  registerRateLimit(app, { db: database.db });
  registerAccessControl(app, { auth, db: database.db });
  registerExecutionContext(app, {
    db: database.db,
    services: createServices({
      auth,
      secret,
      setupCode,
      files,
      plugins,
      publicUrl: config.publicUrl,
      updateCheck: config.updateCheck,
    }),
  });
  registerFileRoutes(app, { files });
  registerPackageRoutes(app);
  app.addHook('onClose', () => plugins.runtime.close());
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });

  registerHealthRoute(app, { database });
  registerAuthRoutes(app, { auth, publicUrl: config.publicUrl });
  registerMeRoute(app, { auth, db: database.db });

  // Features.
  registerSetupRoutes(app);
  registerAccountRoutes(app);
  registerUserRoutes(app);
  registerInvitationRoutes(app);
  registerRoleRoutes(app);
  registerProjectRoutes(app);
  registerIssueRoutes(app);
  registerCommentRoutes(app);
  registerAttachmentRoutes(app);
  registerCategoryRoutes(app);
  registerPriorityRoutes(app);
  registerLabelRoutes(app);
  registerPropertyRoutes(app);
  registerMailRoutes(app);
  registerNotificationRoutes(app);
  registerWorkflowRoutes(app);
  registerUpdateRoutes(app);
  registerPluginRoutes(app);

  const servesWebApp = await registerWebApp(app, webRoot);
  if (!servesWebApp) {
    app.log.info('Web app not built: only the API is served');
  }

  return app;
}
