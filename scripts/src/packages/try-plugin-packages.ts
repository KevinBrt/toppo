/**
 * Proves plugin authors' packages work outside the monorepo, as npm would install them:
 * `npm run plugin-packages:try`. Packs them, starts a plugin in an empty folder with
 * `create-plugin` as packed, installs the packed tarballs there (the other dependencies from
 * npm), then tests, type-checks and builds the plugin.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { npm, packPluginPackages } from './pack-plugin-packages.ts';

const PLUGIN_ID = 'issue-digest';

function main(): void {
  const tarballs = packPluginPackages();
  const workspace = mkdtempSync(join(tmpdir(), 'toppo-plugin-packages-'));
  try {
    const creator = join(workspace, 'creator');
    npm(['init', '--yes'], workspace);
    npm(['install', '--prefix', creator, ...tarballs.values()], workspace);
    execFileSync(
      process.execPath,
      [
        join(creator, 'node_modules', '@toppo-tracker', 'create-plugin', 'dist', 'main.js'),
        PLUGIN_ID,
      ],
      { cwd: workspace, stdio: 'inherit' },
    );
    const plugin = join(workspace, PLUGIN_ID);
    pointAtTarballs(join(plugin, 'package.json'), tarballs);
    for (const args of [['install'], ['test'], ['run', 'typecheck'], ['run', 'build']]) {
      console.log(`> npm ${args.join(' ')}`);
      console.log(npm(args, plugin));
    }
    const zip = join(plugin, 'dist', `${PLUGIN_ID}-0.1.0.zip`);
    if (!existsSync(zip)) {
      throw new Error(`The plugin built no ${zip}`);
    }
    console.log(`The packed packages start, test, type-check and build a plugin: ${zip}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/**
 * Points the new plugin's dependencies on Toppo's packages at the tarballs, not yet on npm, and
 * those packages' own dependencies on each other too.
 */
function pointAtTarballs(path: string, tarballs: ReadonlyMap<string, string>): void {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides?: Record<string, string>;
  };
  const overrides: Record<string, string> = {};
  for (const [name, tarball] of tarballs) {
    const spec = `file:${tarball.replaceAll('\\', '/')}`;
    for (const group of [manifest.dependencies, manifest.devDependencies]) {
      if (name in group) {
        group[name] = spec;
      }
    }
    overrides[name] =
      name in manifest.dependencies || name in manifest.devDependencies ? `$${name}` : spec;
  }
  manifest.overrides = overrides;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
