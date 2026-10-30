import { relative } from 'node:path';
import { ScaffoldError, scaffold } from './scaffold.ts';

export interface CreateIo {
  cwd: string;
  out(line: string): void;
  error(line: string): void;
}

const USAGE = 'Usage: npm create @toppo-tracker/plugin <folder>   (its name is the plugin id)';

/** Exit code of a command used wrong. */
const USAGE_ERROR = 2;

/** Starts a plugin in the folder named, and answers the exit code. */
export function runCreate(args: readonly string[], packagesVersion: string, io: CreateIo): number {
  const [directory, ...rest] = args;
  if (directory === '--help' || directory === '-h') {
    io.out(USAGE);
    return 0;
  }
  if (directory === undefined || directory.startsWith('-') || rest.length > 0) {
    io.error(USAGE);
    return USAGE_ERROR;
  }
  try {
    const { id, root } = scaffold(directory, packagesVersion, io.cwd);
    const folder = relative(io.cwd, root);
    io.out(
      folder ? `Created the plugin ${id} in ${folder}. Next:` : `Created the plugin ${id}. Next:`,
    );
    io.out('');
    const steps = ['npm install', 'npm test', 'npm run build'];
    for (const step of folder ? [`cd ${folder}`, ...steps] : steps) {
      io.out(`  ${step}`);
    }
    return 0;
  } catch (error) {
    if (error instanceof ScaffoldError) {
      io.error(error.message);
      return 1;
    }
    throw error;
  }
}
