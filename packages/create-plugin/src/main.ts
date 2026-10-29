#!/usr/bin/env node
import { runCreate } from './cli.ts';
import { ownVersion } from './scaffold.ts';

process.exitCode = runCreate(process.argv.slice(2), ownVersion(), {
  cwd: process.cwd(),
  out: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
});
