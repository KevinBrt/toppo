/** Where a command reads and writes: the process's own, or a test's. */
export interface CliIo {
  cwd: string;
  out(line: string): void;
  error(line: string): void;
}

export interface CliCommand {
  /** Under its group: `build` is `toppo plugin build`. */
  name: string;
  /** One line, for `toppo --help`. */
  summary: string;
  /** Its arguments, as `toppo <group> <name>` takes them. */
  usage: string;
  /** Answers the process's exit code: 0 when it did its work. */
  run(args: readonly string[], io: CliIo): Promise<number>;
}
