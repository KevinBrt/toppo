import { describe, expect, it } from 'vitest';
import {
  checkExactVersions,
  checkLockfile,
  checkWorkspaceGraph,
  isLicenseAllowed,
  type WorkspaceManifest,
} from './rules.ts';

const workspace = (
  path: string,
  name: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
): WorkspaceManifest => ({ path, name, dependencies, devDependencies });

const shared = workspace('packages/shared', '@toppo/shared');
const db = workspace('packages/db', '@toppo/db');
const testing = workspace('packages/testing', '@toppo/testing');
const sdk = workspace('packages/plugin-sdk', '@toppo/plugin-sdk');

describe('checkWorkspaceGraph', () => {
  it('accepts the documented architecture', () => {
    const core = workspace('packages/core', '@toppo/core', { '@toppo/shared': '0.0.0' });
    const server = workspace(
      'apps/server',
      '@toppo/server',
      { '@toppo/core': '0.0.0', '@toppo/db': '0.0.0' },
      { '@toppo/testing': '0.0.0' },
    );
    expect(checkWorkspaceGraph([shared, core, db, testing, server])).toStrictEqual([]);
  });

  it('keeps core free of infrastructure', () => {
    const core = workspace('packages/core', '@toppo/core', { '@toppo/db': '0.0.0' });
    expect(checkWorkspaceGraph([core, db])).toStrictEqual([
      '@toppo/core: must not depend on @toppo/db',
    ]);
  });

  it('keeps server code out of the browser bundle', () => {
    const web = workspace('apps/web', '@toppo/web', { '@toppo/db': '0.0.0' });
    expect(checkWorkspaceGraph([web, db])).toStrictEqual([
      '@toppo/web: must not depend on @toppo/db',
    ]);
  });

  it('only lets plugins use the SDK', () => {
    const plugin = workspace('plugins/github', '@toppo/plugin-github', {
      '@toppo/plugin-sdk': '0.0.0',
      '@toppo/db': '0.0.0',
    });
    expect(checkWorkspaceGraph([plugin, sdk, db])).toStrictEqual([
      '@toppo/plugin-github: must not depend on @toppo/db',
    ]);
  });

  it('refuses test helpers as a runtime dependency', () => {
    const server = workspace('apps/server', '@toppo/server', { '@toppo/testing': '0.0.0' });
    expect(checkWorkspaceGraph([server, testing])).toStrictEqual([
      '@toppo/server: @toppo/testing may only be a devDependency',
    ]);
  });

  it('asks for rules when a new workspace appears', () => {
    expect(checkWorkspaceGraph([workspace('packages/mailer', '@toppo/mailer')])).toStrictEqual([
      expect.stringContaining('@toppo/mailer: unknown workspace'),
    ]);
  });
});

describe('checkExactVersions', () => {
  it.each(['^1.2.3', '~1.2.3', '*', 'latest', '>=1', 'github:user/repo', 'file:../x'])(
    'refuses %s',
    (spec) => {
      expect(
        checkExactVersions([workspace('apps/web', '@toppo/web', { react: spec })]),
      ).toHaveLength(1);
    },
  );

  it('accepts exact and prerelease versions', () => {
    expect(
      checkExactVersions([workspace('apps/web', '@toppo/web', { a: '1.2.3', b: '1.0.0-rc.4' })]),
    ).toStrictEqual([]);
  });

  it('requires one version of a dependency across workspaces', () => {
    expect(
      checkExactVersions([
        workspace('packages/core', '@toppo/core', {}, { vitest: '5.0.5' }),
        workspace('packages/db', '@toppo/db', {}, { vitest: '5.0.4' }),
      ]),
    ).toStrictEqual(['vitest: one version across the monorepo, found 5.0.5, 5.0.4']);
  });
});

describe('checkLockfile', () => {
  const entry = {
    version: '1.0.0',
    resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
    integrity: 'sha512-abc',
    license: 'MIT',
  };
  const workspaces = new Set(['@toppo/core']);

  it('accepts registry packages and workspace links', () => {
    expect(
      checkLockfile(
        {
          lockfileVersion: 3,
          packages: {
            '': {},
            'node_modules/a': entry,
            'node_modules/@toppo/core': { link: true },
            'packages/core': {},
          },
        },
        workspaces,
      ),
    ).toStrictEqual([]);
  });

  it('refuses a package named like a workspace that is downloaded instead of linked', () => {
    const fromRegistry = (name: string) => ({
      ...entry,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-1.0.0.tgz`,
    });

    const problems = checkLockfile(
      {
        lockfileVersion: 3,
        packages: {
          'node_modules/@toppo/core': fromRegistry('@toppo/core'),
          'node_modules/a/node_modules/@toppo/db': fromRegistry('@toppo/db'),
          'node_modules/@other/core': fromRegistry('@other/core'),
        },
      },
      new Set(['@toppo/core', '@toppo/db']),
    );

    expect(problems).toStrictEqual([
      'node_modules/@toppo/core: @toppo/core is a workspace of this repository: it must be linked, never downloaded',
      'node_modules/a/node_modules/@toppo/db: @toppo/db is a workspace of this repository: it must be linked, never downloaded',
    ]);
  });

  it('refuses packages from other sources', () => {
    const problems = checkLockfile(
      {
        lockfileVersion: 3,
        packages: {
          'node_modules/a': { ...entry, resolved: 'https://evil.example.com/a.tgz' },
          'node_modules/b': { ...entry, resolved: 'git+ssh://git@github.com/x/b.git' },
        },
      },
      workspaces,
    );
    expect(problems).toHaveLength(2);
  });

  it('refuses a tarball other than the package and version an entry names', () => {
    const problems = checkLockfile(
      {
        lockfileVersion: 3,
        packages: {
          'node_modules/fastify': {
            ...entry,
            version: '5.12.7',
            resolved: 'https://registry.npmjs.org/not-fastify/-/not-fastify-1.0.0.tgz',
          },
          'node_modules/@scope/b': {
            ...entry,
            resolved: 'https://registry.npmjs.org/@scope/b/-/b-2.0.0.tgz',
          },
          'node_modules/c': {
            ...entry,
            name: 'evil',
            resolved: 'https://registry.npmjs.org/c/-/c-1.0.0.tgz',
          },
          'node_modules/a/node_modules/@scope/d': {
            ...entry,
            resolved: 'https://registry.npmjs.org/@scope/d/-/d-1.0.0.tgz',
          },
        },
      },
      workspaces,
    );

    expect(problems).toStrictEqual([
      'node_modules/fastify: must resolve to https://registry.npmjs.org/fastify/-/fastify-5.12.7.tgz, got https://registry.npmjs.org/not-fastify/-/not-fastify-1.0.0.tgz',
      'node_modules/@scope/b: must resolve to https://registry.npmjs.org/@scope/b/-/b-1.0.0.tgz, got https://registry.npmjs.org/@scope/b/-/b-2.0.0.tgz',
      'node_modules/c: installs evil under another name: aliases are not allowed',
    ]);
  });

  it('requires integrity hashes', () => {
    const { integrity: _ignored, ...withoutIntegrity } = entry;
    expect(
      checkLockfile(
        { lockfileVersion: 3, packages: { 'node_modules/a': withoutIntegrity } },
        workspaces,
      ),
    ).toStrictEqual(['node_modules/a: missing sha512 integrity']);
  });

  it('checks licenses of shipped packages only', () => {
    expect(
      checkLockfile(
        {
          lockfileVersion: 3,
          packages: {
            'node_modules/gpl-tool': {
              ...entry,
              resolved: 'https://registry.npmjs.org/gpl-tool/-/gpl-tool-1.0.0.tgz',
              license: 'GPL-3.0-only',
              dev: true,
            },
            'node_modules/gpl-lib': {
              ...entry,
              resolved: 'https://registry.npmjs.org/gpl-lib/-/gpl-lib-1.0.0.tgz',
              license: 'GPL-3.0-only',
            },
          },
        },
        workspaces,
      ),
    ).toStrictEqual(['node_modules/gpl-lib: license GPL-3.0-only is not allowed in shipped code']);
  });

  it('refuses old lockfile formats', () => {
    expect(checkLockfile({ lockfileVersion: 2, packages: {} }, workspaces)).toHaveLength(1);
  });
});

describe('isLicenseAllowed', () => {
  it.each([
    ['MIT', true],
    ['MIT-0', true],
    ['(MIT OR Apache-2.0)', true],
    ['(MIT OR GPL-3.0-only)', true],
    ['MIT AND BSD-3-Clause', true],
    ['MIT AND GPL-3.0-only', false],
    ['SSPL-1.0', false],
    ['UNLICENSED', false],
    [undefined, false],
  ])('%s → %s', (expression, allowed) => {
    expect(isLicenseAllowed(expression)).toBe(allowed);
  });
});
