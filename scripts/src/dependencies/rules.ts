/**
 * Dependency rules of the monorepo. The architecture lives here as data:
 * `core` stays pure, the browser never bundles server code, plugins only see the SDK.
 */

export interface WorkspaceManifest {
  /** Directory relative to the repository root, e.g. `packages/core`. */
  path: string;
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Workspace packages each package may depend on (runtime or dev). */
export const ALLOWED_WORKSPACE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  '@toppo/shared': [],
  '@toppo/core': ['@toppo/shared'],
  '@toppo/db': ['@toppo/shared', '@toppo/core'],
  '@toppo/ui': ['@toppo/shared'],
  '@toppo/testing': ['@toppo/shared', '@toppo/core', '@toppo/db'],
  '@toppo/server': ['@toppo/shared', '@toppo/core', '@toppo/db'],
  '@toppo/web': ['@toppo/shared', '@toppo/core', '@toppo/ui'],
  '@toppo/plugin-sdk': ['@toppo/shared'],
  '@toppo/e2e': [],
  '@toppo/scripts': [],
};

/** Workspaces allowed only as devDependencies: test tooling never ships. */
const DEV_ONLY_WORKSPACES = new Set(['@toppo/testing']);

const PLUGIN_ALLOWED = ['@toppo/plugin-sdk'];

/** Licenses compatible with distributing Toppo under AGPL-3.0. */
export const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  // MIT without the notice to keep: Nodemailer.
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'Unlicense',
]);

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const TRUSTED_REGISTRY = 'https://registry.npmjs.org/';

function allDependencies(manifest: WorkspaceManifest): [string, string, 'dev' | 'runtime'][] {
  return [
    ...Object.entries(manifest.dependencies ?? {}).map(
      ([name, spec]) => [name, spec, 'runtime'] as [string, string, 'runtime'],
    ),
    ...Object.entries(manifest.peerDependencies ?? {}).map(
      ([name, spec]) => [name, spec, 'runtime'] as [string, string, 'runtime'],
    ),
    ...Object.entries(manifest.devDependencies ?? {}).map(
      ([name, spec]) => [name, spec, 'dev'] as [string, string, 'dev'],
    ),
  ];
}

export function checkWorkspaceGraph(manifests: readonly WorkspaceManifest[]): string[] {
  const workspaceNames = new Set(manifests.map((manifest) => manifest.name));
  return manifests.flatMap((manifest) => checkWorkspace(manifest, workspaceNames));
}

function checkWorkspace(manifest: WorkspaceManifest, workspaceNames: Set<string>): string[] {
  const isPlugin = manifest.path.startsWith('plugins/');
  const allowed = isPlugin ? PLUGIN_ALLOWED : ALLOWED_WORKSPACE_DEPENDENCIES[manifest.name];
  if (!allowed) {
    return [
      `${manifest.name}: unknown workspace, declare its allowed dependencies in scripts/src/dependencies/rules.ts`,
    ];
  }
  return allDependencies(manifest)
    .filter(([name]) => workspaceNames.has(name))
    .flatMap(([name, , kind]) => {
      if (DEV_ONLY_WORKSPACES.has(name)) {
        return kind === 'dev' ? [] : [`${manifest.name}: ${name} may only be a devDependency`];
      }
      return allowed.includes(name) ? [] : [`${manifest.name}: must not depend on ${name}`];
    });
}

export function checkExactVersions(manifests: readonly WorkspaceManifest[]): string[] {
  const problems: string[] = [];
  const versionsByName = new Map<string, Set<string>>();

  for (const manifest of manifests) {
    for (const [name, spec] of allDependencies(manifest)) {
      if (!EXACT_VERSION.test(spec)) {
        problems.push(`${manifest.name}: ${name}@${spec} must be pinned to an exact version`);
      }
      versionsByName.set(name, (versionsByName.get(name) ?? new Set()).add(spec));
    }
  }
  for (const [name, versions] of versionsByName) {
    if (versions.size > 1) {
      problems.push(`${name}: one version across the monorepo, found ${[...versions].join(', ')}`);
    }
  }
  return problems;
}

export interface LockfileEntry {
  /** Set when the package installed is not the one the path names: an npm alias. */
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  license?: string;
  link?: boolean;
  dev?: boolean;
}

export interface Lockfile {
  lockfileVersion: number;
  packages: Record<string, LockfileEntry>;
}

/** `workspaceNames`: the packages of this repository, which npm must link, never download. */
export function checkLockfile(lockfile: Lockfile, workspaceNames: ReadonlySet<string>): string[] {
  if (lockfile.lockfileVersion !== 3) {
    return [`package-lock.json: expected lockfileVersion 3, found ${lockfile.lockfileVersion}`];
  }
  return Object.entries(lockfile.packages)
    .filter(([path, entry]) => path !== '' && !entry.link && path.includes('node_modules/'))
    .flatMap(([path, entry]) => checkDownloaded(path, entry, workspaceNames));
}

/** One package npm downloads: from where, under which name, with which license. */
function checkDownloaded(
  path: string,
  entry: LockfileEntry,
  workspaceNames: ReadonlySet<string>,
): string[] {
  const name = packageNameOf(path);
  // Downloaded under one of our names, it is whatever someone else published there (our scope
  // on npm is not ours): dependency confusion, however valid its tarball looks.
  if (workspaceNames.has(name)) {
    return [
      `${path}: ${name} is a workspace of this repository: it must be linked, never downloaded`,
    ];
  }
  const problems: string[] = [];
  // The tarball of the very package and version the entry names, which reviews, `npm audit`
  // and dependency review read: never another one swapped in under the same name.
  const expected = registryTarball(name, entry.version);
  if (entry.name !== undefined) {
    problems.push(`${path}: installs ${entry.name} under another name: aliases are not allowed`);
  } else if (entry.resolved !== expected) {
    problems.push(`${path}: must resolve to ${expected}, got ${entry.resolved}`);
  }
  if (!entry.integrity?.startsWith('sha512-')) {
    problems.push(`${path}: missing sha512 integrity`);
  }
  if (!(entry.dev || isLicenseAllowed(entry.license))) {
    problems.push(`${path}: license ${entry.license ?? '(none)'} is not allowed in shipped code`);
  }
  return problems;
}

/** The package a lockfile path installs: `node_modules/a/node_modules/@scope/b` is `@scope/b`. */
function packageNameOf(path: string): string {
  const marker = 'node_modules/';
  return path.slice(path.lastIndexOf(marker) + marker.length);
}

/** Where npmjs.org serves a version of a package: `@scope/b` 1.0.0 is `@scope/b/-/b-1.0.0.tgz`. */
function registryTarball(name: string, version: string | undefined): string {
  const basename = name.slice(name.lastIndexOf('/') + 1);
  return `${TRUSTED_REGISTRY}${name}/-/${basename}-${version}.tgz`;
}

/** Accepts SPDX expressions such as `(MIT OR Apache-2.0)`: OR needs one allowed term, AND needs all. */
export function isLicenseAllowed(expression: string | undefined): boolean {
  if (!expression) {
    return false;
  }
  const normalized = expression.replace(/[()]/g, ' ').trim();
  return normalized
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative.split(/\s+AND\s+/).every((license) => ALLOWED_LICENSES.has(license.trim())),
    );
}
