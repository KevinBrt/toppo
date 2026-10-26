import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const DATABASE_URL = 'postgres://toppo:secret@db:5432/toppo';
const minimalEnv = { TOPPO_DATABASE_URL: DATABASE_URL };

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error('Expected a ConfigError');
}

describe('loadConfig', () => {
  it('applies safe defaults when only the database is configured', () => {
    const config = loadConfig(minimalEnv);

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 3000,
      databaseUrl: DATABASE_URL,
      logLevel: 'info',
      trustProxy: false,
      dataDir: '/data',
      attachmentMaxSize: 20 * 1024 * 1024,
      secret: undefined,
      setupCode: undefined,
      updateCheck: true,
    });
    expect(config.publicUrl.href).toBe('http://localhost:3000/');
  });

  it('reads every supported variable', () => {
    const config = loadConfig({
      TOPPO_URL: 'https://toppo.example.com',
      TOPPO_HOST: '127.0.0.1',
      TOPPO_PORT: '8080',
      TOPPO_DATABASE_URL: 'postgresql://db/toppo',
      TOPPO_LOG_LEVEL: 'warn',
      TOPPO_TRUST_PROXY: 'true',
      TOPPO_DATA_DIR: '/srv/toppo',
      TOPPO_ATTACHMENT_MAX_SIZE_MB: '100',
      TOPPO_SECRET: 's'.repeat(32),
      TOPPO_SETUP_CODE: 'ABCD-EFGH-JKLM',
      TOPPO_UPDATE_CHECK: 'false',
    });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      databaseUrl: 'postgresql://db/toppo',
      logLevel: 'warn',
      trustProxy: true,
      dataDir: '/srv/toppo',
      attachmentMaxSize: 100 * 1024 * 1024,
      secret: 's'.repeat(32),
      setupCode: 'ABCD-EFGH-JKLM',
      updateCheck: false,
    });
    expect(config.publicUrl.origin).toBe('https://toppo.example.com');
  });

  it('ignores variables outside the TOPPO_ namespace', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, PATH: '/usr/bin', NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('requires the database URL', () => {
    expect(issuesOf(() => loadConfig({}))).toStrictEqual([
      expect.stringContaining('TOPPO_DATABASE_URL'),
    ]);
  });

  it('reports every invalid variable at once', () => {
    const issues = issuesOf(() =>
      loadConfig({
        TOPPO_DATABASE_URL: 'mysql://db/toppo',
        TOPPO_PORT: '70000',
        TOPPO_LOG_LEVEL: 'verbose',
        TOPPO_TRUST_PROXY: 'maybe',
      }),
    );

    expect(issues).toHaveLength(4);
    expect(issues.join('\n')).toMatch(/TOPPO_DATABASE_URL: must be a postgres:\/\/ URL/);
  });

  it.each([
    ['ftp://toppo.example.com', 'non-HTTP protocol'],
    ['https://example.com/toppo', 'a path'],
    ['https://toppo.example.com/?a=1', 'a query string'],
    ['not a url', 'garbage'],
  ])('rejects TOPPO_URL %s (%s)', (url) => {
    expect(issuesOf(() => loadConfig({ ...minimalEnv, TOPPO_URL: url }))).toStrictEqual([
      expect.stringContaining('TOPPO_URL'),
    ]);
  });

  it('refuses a short secret or setup code, which could be guessed', () => {
    const issues = issuesOf(() =>
      loadConfig({ ...minimalEnv, TOPPO_SECRET: 'short', TOPPO_SETUP_CODE: '1234' }),
    );

    expect(issues).toStrictEqual([
      'TOPPO_SECRET: must be at least 32 characters',
      'TOPPO_SETUP_CODE: must hold at least 12 letters (A-Z) or digits',
    ]);
  });

  it.each(['------------', 'abcd -- efgh -- ij', 'код-настройки-сервера'])(
    'refuses the setup code %j, too short once dashes, spaces and other scripts are dropped',
    (code) => {
      expect(issuesOf(() => loadConfig({ ...minimalEnv, TOPPO_SETUP_CODE: code }))).toStrictEqual([
        'TOPPO_SETUP_CODE: must hold at least 12 letters (A-Z) or digits',
      ]);
    },
  );

  it.each(['0', '1025', '2.5', '20MB'])('refuses an attachment size limit of %s', (size) => {
    expect(
      issuesOf(() => loadConfig({ ...minimalEnv, TOPPO_ATTACHMENT_MAX_SIZE_MB: size })),
    ).toStrictEqual([expect.stringContaining('TOPPO_ATTACHMENT_MAX_SIZE_MB')]);
  });

  it('treats empty variables as unset, as Docker Compose passes them', () => {
    const config = loadConfig({
      ...minimalEnv,
      TOPPO_SECRET: '',
      TOPPO_SETUP_CODE: '',
      TOPPO_PORT: '',
    });

    expect(config).toMatchObject({ secret: undefined, setupCode: undefined, port: 3000 });
  });

  it('rejects unknown TOPPO_ variables to catch typos', () => {
    expect(issuesOf(() => loadConfig({ ...minimalEnv, TOPPO_DATABSE_URL: 'x' }))).toStrictEqual([
      'TOPPO_DATABSE_URL: unknown variable (typo?)',
    ]);
  });

  describe('_FILE variables (Docker secrets)', () => {
    it('reads the value from the file, without the trailing newline', () => {
      const files: Record<string, string> = { '/run/secrets/db': `${DATABASE_URL}\n` };
      const config = loadConfig({ TOPPO_DATABASE_URL_FILE: '/run/secrets/db' }, (path) => {
        const content = files[path];
        if (content === undefined) {
          throw new Error('ENOENT');
        }
        return content;
      });

      expect(config.databaseUrl).toBe(DATABASE_URL);
    });

    it('reports an unreadable file', () => {
      const issues = issuesOf(() =>
        loadConfig({ TOPPO_DATABASE_URL_FILE: '/missing' }, () => {
          throw new Error('ENOENT');
        }),
      );
      expect(issues).toContain('TOPPO_DATABASE_URL_FILE: cannot read file /missing');
    });

    it('refuses a variable set both directly and through a file', () => {
      const issues = issuesOf(() =>
        loadConfig(
          { ...minimalEnv, TOPPO_DATABASE_URL_FILE: '/run/secrets/db' },
          () => DATABASE_URL,
        ),
      );
      expect(issues).toStrictEqual([
        'TOPPO_DATABASE_URL_FILE: cannot be combined with TOPPO_DATABASE_URL',
      ]);
    });

    it('rejects a _FILE variable for an unknown setting', () => {
      expect(issuesOf(() => loadConfig({ ...minimalEnv, TOPPO_NOPE_FILE: '/x' }))).toStrictEqual([
        'TOPPO_NOPE_FILE: unknown variable (typo?)',
      ]);
    });
  });

  it('never includes secret values in error messages', () => {
    const error = (() => {
      try {
        loadConfig({ TOPPO_DATABASE_URL: 'mysql://user:hunter2@db/toppo' });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(String(error)).not.toContain('hunter2');
  });
});
