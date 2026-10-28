import { formatIssueKey, parseIssueKey } from '@toppo-tracker/core';
import type { IssueWithProject } from '@toppo-tracker/shared';
import type { PaletteCommand, PaletteOption } from '../models/palette.model.ts';

/** Lower case without accents, so that "parametres" finds "Paramètres". */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** The commands whose name contains what is typed; every one before anything is typed. */
export function matchingCommands(
  commands: readonly PaletteCommand[],
  text: string,
): PaletteCommand[] {
  const needle = folded(text.trim());
  return commands.filter((command) => folded(command.label).includes(needle));
}

/**
 * What the palette lists for `text`, in order: the issue a typed key names (`web-42`), unless it
 * is among those found; the issues found; the matching commands.
 */
export function paletteOptions(
  text: string,
  issues: readonly IssueWithProject[],
  commands: readonly PaletteCommand[],
): PaletteOption[] {
  const reference = parseIssueKey(text);
  const named = reference ? formatIssueKey(reference) : null;
  const key: PaletteOption[] =
    named && !issues.some((issue) => issue.key === named) ? [{ kind: 'key', key: named }] : [];
  return [
    ...key,
    ...issues.map((issue): PaletteOption => ({ kind: 'issue', issue })),
    ...matchingCommands(commands, text).map(
      (command): PaletteOption => ({ kind: 'command', command }),
    ),
  ];
}
