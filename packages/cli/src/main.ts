#!/usr/bin/env node
import { runCli } from './cli.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
});
