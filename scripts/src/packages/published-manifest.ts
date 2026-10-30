/**
 * Plugin authors' packages, as npm receives them. In the monorepo they point at their TypeScript
 * sources, which Node runs as they are; Node never strips types under `node_modules`, so a
 * published package points at what `tsc` compiled into `dist/`, with its declarations.
 */

/** Published in this order, each after what it depends on, all at one version. */
export const PLUGIN_PACKAGES = [
  'plugin-sdk',
  'plugin-ui',
  'plugin-testing',
  'cli',
  'create-plugin',
] as const;

export interface SourceManifest {
  name: string;
  version: string;
  description: string;
  license: string;
  exports?: Record<string, string>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** `./src/protocol/index.ts` is published as `./dist/protocol/index.js`. */
function compiled(path: string, extension: '.js' | '.d.ts'): string {
  if (!/^\.\/src\/.+\.ts$/.test(path)) {
    throw new Error(`${path} is not a TypeScript source of src/`);
  }
  return path.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, extension);
}

/**
 * The package.json npm publishes: its entries compiled, its dependencies on the repository's own
 * packages at the version published with it, nothing of the monorepo's (scripts, devDependencies).
 */
export function publishedManifest(source: SourceManifest, directory: string): object {
  const ownDependencies = Object.entries(source.dependencies ?? {}).filter(([name]) =>
    name.startsWith('@toppo-tracker/'),
  );
  for (const [name, version] of ownDependencies) {
    if (version !== source.version) {
      throw new Error(`${source.name} depends on ${name} ${version}, not ${source.version}`);
    }
  }
  return {
    name: source.name,
    version: source.version,
    description: source.description,
    license: source.license,
    type: 'module',
    repository: {
      type: 'git',
      url: 'git+https://github.com/KevinBrt/toppo.git',
      directory,
    },
    homepage: 'https://toppo-tracker.app/plugins/',
    keywords: ['toppo', 'plugin', 'issue-tracker'],
    engines: { node: '>=24.11.0' },
    ...(source.exports && {
      exports: Object.fromEntries(
        Object.entries(source.exports).map(([entry, path]) => [
          entry,
          { types: compiled(path, '.d.ts'), default: compiled(path, '.js') },
        ]),
      ),
    }),
    ...(source.bin && {
      bin: Object.fromEntries(
        Object.entries(source.bin).map(([command, path]) => [command, compiled(path, '.js')]),
      ),
    }),
    files: ['dist'],
    ...(source.dependencies && { dependencies: source.dependencies }),
    ...(source.peerDependencies && { peerDependencies: source.peerDependencies }),
    publishConfig: { access: 'public', provenance: true },
  };
}
