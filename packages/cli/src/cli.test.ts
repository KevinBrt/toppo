import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.ts';
import type { CliIo } from './command.ts';

const FIXTURES = fileURLToPath(new URL('../test-fixtures/', import.meta.url));
let out: string;

beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), 'toppo-cli-'));
});

afterEach(() => rm(out, { recursive: true, force: true }));

/** Runs `toppo` as from the fixtures' folder, and keeps what it writes. */
function toppo(...args: string[]) {
  return toppoIn(FIXTURES, ...args);
}

async function toppoIn(cwd: string, ...args: string[]) {
  const lines = { out: [] as string[], error: [] as string[] };
  const io: CliIo = {
    cwd,
    out: (line) => lines.out.push(line),
    error: (line) => lines.error.push(line),
  };
  const code = await runCli(args, io);
  return { code, out: lines.out.join('\n'), error: lines.error.join('\n') };
}

describe('the toppo command', () => {
  it('lists its tools when asked, and when given none', async () => {
    const asked = await toppo('--help');

    expect(asked.code).toBe(0);
    expect(asked.out).toContain('toppo plugin build [directory] [--out <directory>]');
    expect((await toppo()).code).toBe(2);
  });

  it('refuses a command it does not know', async () => {
    const unknown = await toppo('plugin', 'publish');

    expect(unknown.code).toBe(2);
    expect(unknown.error).toBe('Unknown command: toppo plugin publish');
    expect((await toppo('pluginz')).error).toBe('Unknown command: toppo pluginz');
  });

  it('builds a plugin, and says what it declares', async () => {
    const built = await toppo('plugin', 'build', 'time-tracking', '--out', out);

    expect(built.code).toBe(0);
    expect(built.out).toMatch(
      /^Built time-tracking 1\.2\.0: .*time-tracking-1\.2\.0\.zip \(\d+ KB\)/,
    );
    expect(built.out).toContain('needs: issue.read, comment.create');
    expect(built.out).toContain('adds permissions: entries.log');
    expect(built.out).toContain('actions: timeEntry.log');
    expect(built.out).toContain('events: issue.statusChanged');
  });

  it('lists the screens a plugin draws, each where it shows', async () => {
    const built = await toppo('plugin', 'build', 'screens', '--out', out);

    expect(built.code).toBe(0);
    expect(built.out).toContain('screens: report (main), reportOver (dialog)');
  });

  it('tells why a plugin cannot be built, without a stack', async () => {
    const failed = await toppo('plugin', 'build', 'no-version', '--out', out);

    expect(failed.code).toBe(1);
    expect(failed.error).toBe('Its package.json needs a version, such as 1.2.0');
  });

  it('tells why a plugin that imports Node’s modules fails, as it is', async () => {
    const failed = await toppo('plugin', 'build', 'node-api', '--out', out);

    expect(failed.code).toBe(1);
    expect(failed.error).toMatch(
      /^src[\\/]plugin\.ts imports node:fs: plugins run in Toppo's sandbox, without Node's modules$/,
    );
  });

  it('builds the plugin of the folder it runs in, into its dist/, and says what it lacks', async () => {
    const dist = join(FIXTURES, 'minimal', 'dist');
    try {
      const built = await toppoIn(join(FIXTURES, 'minimal'), 'plugin', 'build');

      expect(built.code).toBe(0);
      expect(built.out).toContain(join('dist', 'minimal-1.0.0.zip'));
      expect(built.out).toContain('needs: none');
      expect(built.out).toContain('events: none');
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });

  it('lets through an error that is not the plugin’s', async () => {
    const file = join(out, 'a-file');
    await writeFile(file, '');

    await expect(
      toppo('plugin', 'build', 'minimal', '--out', join(file, 'dist')),
    ).rejects.toThrow();
  });

  it('refuses an option it does not know', async () => {
    const wrong = await toppo('plugin', 'build', '--force');

    expect(wrong.code).toBe(2);
    expect(wrong.error).toContain('Usage: toppo plugin build [directory] [--out <directory>]');
  });
});
