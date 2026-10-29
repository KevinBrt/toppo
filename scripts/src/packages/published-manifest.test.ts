import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../repository.ts';
import { PLUGIN_PACKAGES, publishedManifest, type SourceManifest } from './published-manifest.ts';

const SDK: SourceManifest = {
  name: '@toppo-tracker/plugin-sdk',
  version: '0.1.0',
  description: 'What a Toppo plugin is written with.',
  license: 'MIT',
  exports: { '.': './src/index.ts', './protocol': './src/protocol/index.ts' },
  dependencies: { zod: '4.6.7' },
};

describe('a plugin package as npm receives it', () => {
  it('points at what tsc compiled, with its declarations', () => {
    expect(publishedManifest(SDK, 'packages/plugin-sdk')).toMatchObject({
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './protocol': { types: './dist/protocol/index.d.ts', default: './dist/protocol/index.js' },
      },
      files: ['dist'],
      dependencies: { zod: '4.6.7' },
      repository: { directory: 'packages/plugin-sdk' },
      publishConfig: { access: 'public', provenance: true },
    });
  });

  it('runs its command from what tsc compiled', () => {
    const cli = { ...SDK, name: '@toppo-tracker/cli', bin: { toppo: './src/main.ts' } };

    expect(publishedManifest(cli, 'packages/cli')).toMatchObject({
      bin: { toppo: './dist/main.js' },
    });
  });

  it('keeps nothing of the monorepo’s', () => {
    const source = { ...SDK, private: true, scripts: { test: 'vitest' }, devDependencies: {} };
    const published = publishedManifest(source, 'packages/plugin-sdk');

    for (const field of ['private', 'scripts', 'devDependencies']) {
      expect(published).not.toHaveProperty(field);
    }
  });

  it('refuses a dependency on another of Toppo’s packages at another version', () => {
    const ui = {
      ...SDK,
      name: '@toppo-tracker/plugin-ui',
      dependencies: { '@toppo-tracker/plugin-sdk': '0.0.9' },
    };

    expect(() => publishedManifest(ui, 'packages/plugin-ui')).toThrow(
      '@toppo-tracker/plugin-ui depends on @toppo-tracker/plugin-sdk 0.0.9, not 0.1.0',
    );
  });

  it('refuses an entry outside the TypeScript sources', () => {
    expect(() =>
      publishedManifest({ ...SDK, exports: { '.': './index.js' } }, 'packages/plugin-sdk'),
    ).toThrow('./index.js is not a TypeScript source of src/');
  });

  it('publishes each plugin package of the repository at one version, under MIT', () => {
    const manifests = PLUGIN_PACKAGES.map(
      (name): SourceManifest =>
        JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'packages', name, 'package.json'), 'utf8')),
    );

    expect(new Set(manifests.map(({ version }) => version)).size).toBe(1);
    expect(manifests.map(({ license }) => license)).toStrictEqual(PLUGIN_PACKAGES.map(() => 'MIT'));
    for (const manifest of manifests) {
      expect(() => publishedManifest(manifest, 'packages')).not.toThrow();
    }
  });
});
