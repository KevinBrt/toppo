import { readFileSync } from 'node:fs';
import { ATTACHMENT_SIZE_CEILING } from '@toppo-tracker/shared';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  /** Public URL users reach Toppo at, e.g. `https://toppo.example.com`. */
  publicUrl: URL;
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  /**
   * Toppo is reached through one reverse proxy, whose `X-Forwarded-*` headers it reads: the client
   * is the address that proxy added. Enable only when Toppo is reachable solely through it.
   */
  trustProxy: boolean;
  /** Persistent files: generated secret key, attachments. */
  dataDir: string;
  /** Largest file people may attach, in bytes. */
  attachmentMaxSize: number;
  /** Signs sessions. Generated into `dataDir` on first start unless provided. */
  secret: string | undefined;
  /** Preset first-run code for automated deployments; otherwise a random one is logged. */
  setupCode: string | undefined;
  /** Whether Toppo asks GitHub, once a day, for the latest version published. */
  updateCheck: boolean;
}

export const SECRET_MIN_LENGTH = 32;
export const SETUP_CODE_MIN_LENGTH = 12;

/** Attachment sizes are set in mebibytes, as people read file sizes. */
const MEBIBYTE = 1024 * 1024;

const envSchema = z.object({
  TOPPO_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .transform((value) => new URL(value))
    .refine((url) => url.pathname === '/' && url.search === '' && url.hash === '', {
      message: 'must be an origin without path, query or fragment, e.g. https://toppo.example.com',
    }),
  TOPPO_HOST: z.string().min(1).default('0.0.0.0'),
  TOPPO_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  TOPPO_DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// URL',
  }),
  TOPPO_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  TOPPO_TRUST_PROXY: z.stringbool().default(false),
  TOPPO_DATA_DIR: z.string().min(1).default('/data'),
  TOPPO_ATTACHMENT_MAX_SIZE_MB: z.coerce
    .number()
    .int()
    .min(1)
    .max(ATTACHMENT_SIZE_CEILING / MEBIBYTE)
    .default(20),
  TOPPO_SECRET: z
    .string()
    .min(SECRET_MIN_LENGTH, `must be at least ${SECRET_MIN_LENGTH} characters`)
    .optional(),
  // Counted as the setup screen compares it, ignoring case and anything but letters and digits:
  // `----------------` or a non-Latin phrase would otherwise leave a code of nothing to guess.
  TOPPO_SETUP_CODE: z
    .string()
    .refine(
      (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').length >= SETUP_CODE_MIN_LENGTH,
      `must hold at least ${SETUP_CODE_MIN_LENGTH} letters (A-Z) or digits`,
    )
    .optional(),
  TOPPO_UPDATE_CHECK: z.stringbool().default(true),
});

const KNOWN_VARIABLES = new Set(Object.keys(envSchema.shape));

/** Suffix that reads a variable from a file, for Docker secrets: `TOPPO_DATABASE_URL_FILE=/run/secrets/db`. */
const FILE_SUFFIX = '_FILE';

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

type Env = Record<string, string | undefined>;
type ReadFile = (path: string) => string;

const readFileUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

/** Reads and validates `TOPPO_*` variables. Throws a `ConfigError` listing every problem at once. */
export function loadConfig(env: Env, readFile: ReadFile = readFileUtf8): Config {
  const issues: string[] = [];
  const values = resolveVariables(env, readFile, issues);
  const result = envSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }
  if (!result.success || issues.length > 0) {
    throw new ConfigError(issues);
  }

  const parsed = result.data;
  return {
    publicUrl: parsed.TOPPO_URL,
    host: parsed.TOPPO_HOST,
    port: parsed.TOPPO_PORT,
    databaseUrl: parsed.TOPPO_DATABASE_URL,
    logLevel: parsed.TOPPO_LOG_LEVEL,
    trustProxy: parsed.TOPPO_TRUST_PROXY,
    dataDir: parsed.TOPPO_DATA_DIR,
    attachmentMaxSize: parsed.TOPPO_ATTACHMENT_MAX_SIZE_MB * MEBIBYTE,
    secret: parsed.TOPPO_SECRET,
    setupCode: parsed.TOPPO_SETUP_CODE,
    updateCheck: parsed.TOPPO_UPDATE_CHECK,
  };
}

function resolveVariables(env: Env, readFile: ReadFile, issues: string[]): Env {
  const values: Env = {};

  for (const [name, value] of Object.entries(env)) {
    // Empty means unset: Compose turns `${TOPPO_SECRET:-}` into an empty string.
    if (!name.startsWith('TOPPO_') || value === undefined || value === '') {
      continue;
    }
    const target = name.endsWith(FILE_SUFFIX) ? name.slice(0, -FILE_SUFFIX.length) : name;
    if (!KNOWN_VARIABLES.has(target)) {
      issues.push(`${name}: unknown variable (typo?)`);
      continue;
    }
    if (target === name) {
      values[target] ??= value;
      continue;
    }
    if (env[target] !== undefined) {
      issues.push(`${name}: cannot be combined with ${target}`);
      continue;
    }
    try {
      values[target] = readFile(value).trim();
    } catch {
      issues.push(`${name}: cannot read file ${value}`);
    }
  }

  return values;
}
