import { randomUUID } from 'node:crypto';
import type { Database } from '@toppo/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAccountRoutes } from './features/account/account.routes.ts';
import { registerAttachmentRoutes } from './features/attachments/attachments.routes.ts';
import { registerCategoryRoutes } from './features/categories/categories.routes.ts';
import { registerCommentRoutes } from './features/comments/comments.routes.ts';
import { registerInvitationRoutes } from './features/invitations/invitations.routes.ts';
import { emailInvitationJob } from './features/invitations/jobs/email-invitation.job.ts';
import { registerIssueRoutes } from './features/issues/issues.routes.ts';
import { registerLabelRoutes } from './features/labels/labels.routes.ts';
import { registerMailRoutes } from './features/mail/mail.routes.ts';
import { emailNotificationJob } from './features/notifications/jobs/email-notification.job.ts';
import { notifyActivityJob } from './features/notifications/jobs/notify-activity.job.ts';
import { pruneNotificationsJob } from './features/notifications/jobs/prune-notifications.job.ts';
import { registerNotificationRoutes } from './features/notifications/notifications.routes.ts';
import { registerPriorityRoutes } from './features/priorities/priorities.routes.ts';
import { registerProjectRoutes } from './features/projects/projects.routes.ts';
import { registerPropertyRoutes } from './features/properties/properties.routes.ts';
import { registerRoleRoutes } from './features/roles/roles.routes.ts';
import { registerSetupRoutes } from './features/setup/setup.routes.ts';
import { registerUserRoutes } from './features/users/users.routes.ts';
import { registerWorkflowRoutes } from './features/workflows/workflows.routes.ts';
import { registerAccessControl } from './platform/auth/access-control.ts';
import type { Auth } from './platform/auth/auth.ts';
import { registerAuthRoutes } from './platform/auth/auth-routes.ts';
import { registerMeRoute } from './platform/auth/me-route.ts';
import { passwordResetMailJob } from './platform/auth/password-reset-mail.ts';
import type { Config } from './platform/config/config.ts';
import { createSecretBox } from './platform/config/secret-box.ts';
import type { Services } from './platform/cqrs/cqrs.ts';
import { registerExecutionContext } from './platform/cqrs/execution-context.ts';
import { registerHealthRoute } from './platform/health/health-route.ts';
import { registerErrorHandler } from './platform/http/error-handler.ts';
import { registerOriginCheck } from './platform/http/origin-check.ts';
import { registerRateLimit } from './platform/http/rate-limit.ts';
import { enforceRouteContracts } from './platform/http/route-contracts.ts';
import { registerSecurityHeaders } from './platform/http/security-headers.ts';
import { registerWebApp } from './platform/http/web-app.ts';
import { serializerCompiler, validatorCompiler } from './platform/http/zod.ts';
import type { RunnableJob } from './platform/jobs/jobs.ts';
import { createMailer } from './platform/mail/mailer.ts';
import { registerFileRoutes } from './platform/uploads/file-routes.ts';
import type { FileStorage } from './platform/uploads/file-storage.ts';
import { fileSweepJob } from './platform/uploads/file-sweeper.ts';

export interface AppDependencies {
  config: Pick<Config, 'publicUrl' | 'logLevel' | 'trustProxy'>;
  database: Pick<Database, 'db' | 'ping'>;
  auth: Auth;
  /** The instance's key (`TOPPO_SECRET` or generated): signs sessions, seals stored secrets. */
  secret: string;
  /** First-run code accepted by the setup wizard. */
  setupCode: string;
  /** Attached files, under `<dataDir>/uploads`. */
  files: FileStorage;
  /** Directory of the compiled web app. Not configurable: it ships inside the image. */
  webRoot: string;
}

const BODY_LIMIT_BYTES = 1024 * 1024;
/**
 * Long enough to attach 20 MB over a slow mobile connection; Node's own default. Slow headers
 * are still cut after a minute (`headersTimeout`).
 */
const REQUEST_TIMEOUT_MS = 300_000;

/** What commands and queries may use besides the database. */
export function createServices({
  auth,
  secret,
  setupCode,
  files,
  publicUrl,
}: Pick<AppDependencies, 'auth' | 'secret' | 'setupCode' | 'files'> & {
  publicUrl: URL;
}): Services {
  const secrets = createSecretBox(secret);
  return {
    hashPassword: async (password) => (await auth.$context).password.hash(password),
    setupCode,
    publicUrl,
    files,
    secrets,
    mailer: createMailer(secrets),
  };
}

/** Every job the workers run: each server process runs one worker, `main.ts` starts it. */
export function createJobs({ files }: Pick<AppDependencies, 'files'>): RunnableJob[] {
  return [
    fileSweepJob(files),
    notifyActivityJob,
    pruneNotificationsJob,
    emailInvitationJob,
    passwordResetMailJob,
    emailNotificationJob,
  ];
}

/** Builds the Fastify application without listening, so tests can drive it with `inject()`. */
export async function buildApp({
  config,
  database,
  auth,
  secret,
  setupCode,
  files,
  webRoot,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.trustProxy,
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
    services: createServices({ auth, secret, setupCode, files, publicUrl: config.publicUrl }),
  });
  registerFileRoutes(app, { files });
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

  const servesWebApp = await registerWebApp(app, webRoot);
  if (!servesWebApp) {
    app.log.info('Web app not built: only the API is served');
  }

  return app;
}
