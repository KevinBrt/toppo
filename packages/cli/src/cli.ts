import type { CliCommand, CliIo } from './command.ts';
import { buildCommand } from './commands/plugin/build.ts';

/**
 * Toppo's tools, by group: `toppo <group> <command>`. A new tool is a command in a group, a new
 * kind of tools a new group (a folder of `commands/`).
 */
const GROUPS: Readonly<Record<string, { summary: string; commands: readonly CliCommand[] }>> = {
  plugin: { summary: 'Build and check Toppo plugins', commands: [buildCommand] },
};

/** Exit code of a command used wrong: an unknown group or command. */
const USAGE_ERROR = 2;

function help(io: CliIo): void {
  io.out('Usage: toppo <group> <command> [arguments]');
  for (const [group, { summary, commands }] of Object.entries(GROUPS)) {
    io.out('');
    io.out(`${group}: ${summary}`);
    for (const command of commands) {
      io.out(`  toppo ${group} ${command.name} ${command.usage}`.trimEnd());
      io.out(`      ${command.summary}`);
    }
  }
}

/** Runs `toppo` with its arguments, and answers the exit code. */
export async function runCli(args: readonly string[], io: CliIo): Promise<number> {
  const [group, name, ...rest] = args;
  if (group === undefined || group === '--help' || group === '-h') {
    help(io);
    return group === undefined ? USAGE_ERROR : 0;
  }
  const command = GROUPS[group]?.commands.find((candidate) => candidate.name === name);
  if (!command) {
    io.error(`Unknown command: toppo ${[group, name].filter(Boolean).join(' ')}`);
    help(io);
    return USAGE_ERROR;
  }
  return await command.run(rest, io);
}
