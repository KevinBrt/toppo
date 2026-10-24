import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, waitForDatabase } from '@toppo/db';
import { buildApp, createJobs, createServices } from './app.ts';
import { getSetupStatus } from './features/setup/queries/get-setup-status.query.ts';
import { generateSetupCode } from './features/setup/utils/setup-code.util.ts';
import { createAuth } from './platform/auth/auth.ts';
import { type Config, ConfigError, loadConfig } from './platform/config/config.ts';
import { resolveSecret } from './platform/config/secret.ts';
import { startJobWorker } from './platform/jobs/job-worker.ts';
import { scheduleRecurringJobs } from './platform/jobs/jobs.ts';
import { createFileStorage } from './platform/uploads/file-storage.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/*
 * Resolved from the entry point, which sits at the same depth in source (`src/main.ts`) and in
 * the bundle (`dist/main.js`). Never move these into a shared module: bundle chunks live elsewhere.
 */
const WEB_ROOT = fileURLToPath(new URL('../../web/dist', import.meta.url));
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../packages/db/migrations', import.meta.url),
);

function loadConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\nSee .env.example for every supported variable.\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const database = createDatabase({ url: config.databaseUrl });
const secret = await resolveSecret(config.secret, config.dataDir);
const auth = createAuth({ db: database.db, secret, publicUrl: config.publicUrl });
const setupCode = config.setupCode ?? generateSetupCode();
const files = await createFileStorage({
  root: join(config.dataDir, 'uploads'),
  maxFileSize: config.attachmentMaxSize,
});
const app = await buildApp({ config, database, auth, secret, setupCode, files, webRoot: WEB_ROOT });
const services = createServices({ auth, secret, setupCode, files, publicUrl: config.publicUrl });
const jobs = createJobs({ files });
let worker: { stop: () => Promise<void> } | undefined;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Shutting down');
  const forceExit = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  // The job under way ends first; the queue keeps the rest for the next start.
  await worker?.stop();
  await app.close();
  await database.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, (received) => {
    void shutdown(received);
  });
}

try {
  await waitForDatabase(database, {
    onRetry: (attempt) => app.log.warn({ attempt }, 'Waiting for PostgreSQL'),
  });
  await database.migrate(MIGRATIONS_FOLDER);
  await app.listen({ host: config.host, port: config.port });
  await scheduleRecurringJobs(database.db, jobs);
  worker = startJobWorker({ db: database.db, jobs, log: app.log, services });

  const { required } = await getSetupStatus.execute(
    { db: database.db, actor: null, log: app.log, services },
    {},
  );
  if (required) {
    const origin = config.publicUrl.origin;
    app.log.warn(
      config.setupCode
        ? `Toppo is not set up yet: open ${origin} and enter the setup code from TOPPO_SETUP_CODE`
        : `Toppo is not set up yet: open ${origin} and enter the setup code ${setupCode}`,
    );
  }
} catch (error) {
  app.log.fatal({ err: error }, 'Toppo failed to start');
  await database.close();
  process.exit(1);
}
