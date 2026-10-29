import { API_VERSION } from '@toppo-tracker/plugin-sdk/protocol';

/**
 * The tools a new plugin builds and tests with, in the versions Toppo's own plugins use: a test
 * keeps them equal to the monorepo's.
 */
export const TOOL_VERSIONS = { typescript: '7.0.2', vitest: '5.0.5' } as const;

export interface PluginTemplate {
  /** The plugin's id, which names its folder: `my-plugin`. */
  id: string;
  /** The version of Toppo's packages to depend on: this package's own. */
  packagesVersion: string;
}

/** `my-plugin` reads "My plugin". */
export function titleOf(id: string): string {
  const words = id.split('-').join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The files of a new plugin, by path: one action, its test, and what builds them. */
export function templateFiles({ id, packagesVersion }: PluginTemplate): Record<string, string> {
  const title = titleOf(id);
  return {
    'package.json': `${JSON.stringify(
      {
        name: id,
        version: '0.1.0',
        private: true,
        description: `${title}, a Toppo plugin.`,
        type: 'module',
        scripts: {
          build: 'toppo plugin build',
          typecheck: 'tsc',
          test: 'vitest run',
        },
        dependencies: { '@toppo-tracker/plugin-sdk': packagesVersion },
        devDependencies: {
          '@toppo-tracker/cli': packagesVersion,
          '@toppo-tracker/plugin-testing': packagesVersion,
          typescript: TOOL_VERSIONS.typescript,
          vitest: TOOL_VERSIONS.vitest,
        },
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'es2024',
          lib: ['es2024'],
          module: 'nodenext',
          moduleResolution: 'nodenext',
          moduleDetection: 'force',
          allowImportingTsExtensions: true,
          noEmit: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
    '.gitignore': 'node_modules/\ndist/\n',
    'src/plugin.ts': `import { definePlugin } from '@toppo-tracker/plugin-sdk';

/** ${title}: what Toppo shows to who approves it is in its messages, below. */
export const plugin = definePlugin({
  id: '${id}',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^${API_VERSION}',
  messages: {
    en: {
      plugin: { name: '${title}', description: 'What ${title} does, in a sentence.' },
      greeting: 'Hello, {name}!',
    },
    fr: {
      plugin: { name: '${title}', description: 'Ce que fait ${title}, en une phrase.' },
      greeting: 'Bonjour, {name} !',
    },
  },
});
`,
    'src/actions/greet.action.ts': `import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

/** Greets whoever asks, in their language: an action anyone signed in may run. */
export const greet = plugin.defineAction({
  name: 'greeting.say',
  access: 'authenticated',
  input: z.object({ name: z.string().trim().min(1).max(100) }),
  handler: (ctx, { name }) => Promise.resolve({ text: ctx.t('greeting', { name }) }),
});
`,
    'src/actions/greet.action.test.ts': `import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { greet } from './greet.action.ts';

describe('greeting.say', () => {
  it('greets whoever asks, in their language', async () => {
    const toppo = createTestToppo(plugin, { locale: 'fr' });
    const someone = toppo.createUser();

    expect(await someone.run(greet, { name: ' Ada ' })).toStrictEqual({ text: 'Bonjour, Ada !' });
  });
});
`,
    'README.md': `# ${title}

A plugin for [Toppo](https://toppo-tracker.app).

\`\`\`sh
npm install
npm test           # its tests, against a Toppo in memory
npm run typecheck
npm run build      # dist/${id}-<version>.zip, to install in Settings › Plugins
\`\`\`

Writing plugins: https://toppo-tracker.app/plugins/
`,
  };
}
