/**
 * Guards the dependency tree: architecture boundaries between workspaces, exact versions,
 * a lockfile that only pulls from npmjs.org the very package and version each entry names and
 * always links the repository's own packages, and AGPL-compatible licenses.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkExactVersions,
  checkLockfile,
  checkWorkspaceGraph,
  type Lockfile,
  type WorkspaceManifest,
} from './dependencies/rules.ts';
import { listRepositoryFiles, REPOSITORY_ROOT, readRepositoryFile } from './repository.ts';

const manifests: WorkspaceManifest[] = listRepositoryFiles()
  .filter((path) =>
    /^(apps|packages|plugins)\/[^/]+\/package\.json$|^(e2e|scripts)\/package\.json$/.test(path),
  )
  .map((path) => ({
    ...(JSON.parse(readRepositoryFile(path)) as Omit<WorkspaceManifest, 'path'>),
    path: path.replace(/\/package\.json$/, ''),
  }));

const root = JSON.parse(readRepositoryFile('package.json')) as Omit<WorkspaceManifest, 'path'>;

if (!existsSync(join(REPOSITORY_ROOT, 'package-lock.json'))) {
  console.error('package-lock.json is missing: run `npm install` and commit it.');
  process.exit(1);
}
const lockfile = JSON.parse(readRepositoryFile('package-lock.json')) as Lockfile;

const problems = [
  ...checkWorkspaceGraph(manifests),
  ...checkExactVersions([...manifests, { ...root, path: '.' }]),
  ...checkLockfile(lockfile, new Set(manifests.map((manifest) => manifest.name))),
];

if (problems.length > 0) {
  console.error(`${problems.length} dependency problem(s):\n`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}

console.log(`Dependencies: OK (${manifests.length} workspaces)`);
