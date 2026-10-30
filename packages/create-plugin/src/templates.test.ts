import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOL_VERSIONS, templateFiles, titleOf } from './templates.ts';

/** A package.json of the monorepo, read as JSON. */
function manifestOf(path: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
}

describe('a new plugin', () => {
  it('depends on Toppo packages of one version, and builds and tests with them', () => {
    const files = templateFiles({ id: 'issue-digest', packagesVersion: '0.4.2' });

    expect(JSON.parse(files['package.json'] ?? '')).toStrictEqual({
      name: 'issue-digest',
      version: '0.1.0',
      private: true,
      description: 'Issue digest, a Toppo plugin.',
      type: 'module',
      scripts: { build: 'toppo plugin build', typecheck: 'tsc', test: 'vitest run' },
      dependencies: { '@toppo-tracker/plugin-sdk': '0.4.2' },
      devDependencies: {
        '@toppo-tracker/cli': '0.4.2',
        '@toppo-tracker/plugin-testing': '0.4.2',
        typescript: TOOL_VERSIONS.typescript,
        vitest: TOOL_VERSIONS.vitest,
      },
    });
  });

  it('builds and tests with the versions Toppo’s own plugins use', () => {
    expect(manifestOf('package.json').devDependencies?.['typescript']).toBe(
      TOOL_VERSIONS.typescript,
    );
    expect(manifestOf('plugins/time-tracking/package.json').devDependencies?.['vitest']).toBe(
      TOOL_VERSIONS.vitest,
    );
  });

  it('is named after its id, in both languages', () => {
    const plugin = templateFiles({ id: 'issue-digest', packagesVersion: '0.4.2' })['src/plugin.ts'];

    expect(titleOf('issue-digest')).toBe('Issue digest');
    expect(plugin).toContain("name: 'Issue digest', description: 'What Issue digest does");
    expect(plugin).toContain("name: 'Issue digest', description: 'Ce que fait Issue digest");
  });
});
