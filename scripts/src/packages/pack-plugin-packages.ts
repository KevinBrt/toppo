/**
 * Builds plugin authors' packages and packs each one as npm would publish it, into
 * `dist/plugin-packages/`: `npm run plugin-packages:pack`. Publishing is the workflow's
 * (`publish-plugin-packages.yml`); trying them out, `try-plugin-packages.ts`'s.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../repository.ts';
import { PLUGIN_PACKAGES, publishedManifest, type SourceManifest } from './published-manifest.ts';

export const PACKED_FOLDER = join(REPOSITORY_ROOT, 'dist', 'plugin-packages');

/**
 * npm, run by Node without a shell, whose arguments would go unescaped: the npm that runs this
 * script (`npm run`), or the one on the PATH.
 */
export function npm(args: readonly string[], cwd: string): string {
  const npmCli = process.env['npm_execpath'];
  const [command, prefix] = npmCli ? [process.execPath, [npmCli]] : ['npm', []];
  return execFileSync(command, [...prefix, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** Packs every plugin package, and answers the tarballs, by package name. */
export function packPluginPackages(): Map<string, string> {
  rmSync(PACKED_FOLDER, { recursive: true, force: true });
  const staging = join(PACKED_FOLDER, 'staging');
  const tarballs = new Map<string, string>();
  for (const name of PLUGIN_PACKAGES) {
    const directory = join(REPOSITORY_ROOT, 'packages', name);
    const source: SourceManifest = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    );
    rmSync(join(directory, 'dist'), { recursive: true, force: true });
    npm(['run', 'build', `--workspace=${source.name}`], REPOSITORY_ROOT);
    const stage = join(staging, name);
    mkdirSync(stage, { recursive: true });
    cpSync(join(directory, 'dist'), join(stage, 'dist'), { recursive: true });
    for (const file of ['README.md', 'LICENSE']) {
      if (!existsSync(join(directory, file))) {
        throw new Error(`${source.name} has no ${file}: npm shows it, and its license must ship`);
      }
      cpSync(join(directory, file), join(stage, file));
    }
    writeFileSync(
      join(stage, 'package.json'),
      `${JSON.stringify(publishedManifest(source, `packages/${name}`), null, 2)}\n`,
    );
    const [packed] = JSON.parse(
      npm(['pack', '--json', '--pack-destination', PACKED_FOLDER], stage),
    ) as { filename: string }[];
    if (!packed) {
      throw new Error(`npm packed nothing of ${source.name}`);
    }
    tarballs.set(source.name, join(PACKED_FOLDER, packed.filename));
  }
  rmSync(staging, { recursive: true, force: true });
  return tarballs;
}

if (import.meta.main) {
  for (const [name, tarball] of packPluginPackages()) {
    console.log(`${name}: ${tarball}`);
  }
}
