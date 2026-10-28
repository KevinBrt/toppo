import type { IssueWithProject } from '@toppo-tracker/shared';
import type { LucideIcon } from 'lucide-react';

/** Something the palette offers besides issues: a page to open, an action to take. */
export interface PaletteCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
}

/** What the palette lists: the issue a typed key names, an issue found, a command. */
export type PaletteOption =
  | { kind: 'key'; key: string }
  | { kind: 'issue'; issue: IssueWithProject }
  | { kind: 'command'; command: PaletteCommand };
