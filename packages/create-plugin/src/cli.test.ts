import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CreateIo, runCreate } from './cli.ts';
import { ownVersion } from './scaffold.ts';

let cwd: string;
let out: string[];
let errors: string[];
let io: CreateIo;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'create-plugin-'));
  out = [];
  errors = [];
  io = { cwd, out: (line) => out.push(line), error: (line) => errors.push(line) };
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

/** The files of a folder and its subfolders, as forward-slash paths. */
function filesIn(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .replaceAll('\\', '/'),
    )
    .sort();
}

describe('npm create @toppo-tracker/plugin', () => {
  it('starts a plugin named after its folder, and says what comes next', () => {
    expect(runCreate(['issue-digest'], '0.1.0', io)).toBe(0);

    const root = join(cwd, 'issue-digest');
    expect(filesIn(root)).toStrictEqual([
      '.gitignore',
      'README.md',
      'package.json',
      'src/actions/greet.action.test.ts',
      'src/actions/greet.action.ts',
      'src/plugin.ts',
      'tsconfig.json',
    ]);
    expect(readFileSync(join(root, 'src/plugin.ts'), 'utf8')).toContain("id: 'issue-digest'");
    expect(out).toStrictEqual([
      'Created the plugin issue-digest in issue-digest. Next:',
      '',
      '  cd issue-digest',
      '  npm install',
      '  npm test',
      '  npm run build',
    ]);
    expect(errors).toStrictEqual([]);
  });

  it('starts it in an empty folder that exists already', () => {
    mkdirSync(join(cwd, 'issue-digest'));

    expect(runCreate(['issue-digest'], '0.1.0', io)).toBe(0);
  });

  it('starts it in the folder it is run from', () => {
    mkdirSync(join(cwd, 'issue-digest'));

    expect(runCreate(['.'], '0.1.0', { ...io, cwd: join(cwd, 'issue-digest') })).toBe(0);
    expect(out).toStrictEqual([
      'Created the plugin issue-digest. Next:',
      '',
      '  npm install',
      '  npm test',
      '  npm run build',
    ]);
  });

  it('never takes the place of a file', () => {
    writeFileSync(join(cwd, 'issue-digest'), 'mine');

    expect(runCreate(['issue-digest'], '0.1.0', io)).toBe(1);
    expect(errors[0]).toMatch(/is a file: start the plugin in a new folder/);
  });

  it('never writes over what a folder holds', () => {
    mkdirSync(join(cwd, 'issue-digest'));
    writeFileSync(join(cwd, 'issue-digest', 'notes.md'), 'mine');

    expect(runCreate(['issue-digest'], '0.1.0', io)).toBe(1);
    expect(errors[0]).toMatch(/is not empty: start the plugin in a new folder/);
    expect(filesIn(join(cwd, 'issue-digest'))).toStrictEqual(['notes.md']);
  });

  it.each([
    ['capitals', 'IssueDigest'],
    ['a leading digit', '1-digest'],
    ['two letters', 'id'],
  ])('refuses a folder whose name is no plugin id: %s', (_, name) => {
    expect(runCreate([name], '0.1.0', io)).toBe(1);
    expect(errors[0]).toMatch(/cannot name a plugin/);
  });

  it('shows how to use it when used wrong, or asked', () => {
    expect(runCreate([], '0.1.0', io)).toBe(2);
    expect(runCreate(['a-plugin', 'another'], '0.1.0', io)).toBe(2);
    expect(errors).toHaveLength(2);
    expect(runCreate(['--help'], '0.1.0', io)).toBe(0);
    expect(out[0]).toMatch(/^Usage: npm create @toppo-tracker\/plugin <folder>/);
  });

  it('makes the plugin depend on Toppo packages of its own version', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(manifest).toMatchObject({ version: ownVersion() });
  });
});
