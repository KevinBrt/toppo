import { defineConfig } from 'drizzle-kit';

/**
 * `npm run db:generate --workspace=@toppo-tracker/db` writes a migration from schema changes.
 * Generated SQL is reviewed by a human and never edited once released.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
