import {
  BarChart3Icon,
  BriefcaseIcon,
  CalendarIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  FlagIcon,
  FolderIcon,
  GaugeIcon,
  ListIcon,
  type LucideIcon,
  PuzzleIcon,
  SettingsIcon,
  TagIcon,
  TimerIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';

/**
 * The icons plugins' entries may take, by the names their manifests give (`SCREEN_ICONS`): from
 * Toppo's set, drawn by Toppo. An unknown name, from a newer plugin, falls back to the puzzle.
 */
const SCREEN_ICONS: Readonly<Record<string, LucideIcon>> = {
  'bar-chart': BarChart3Icon,
  briefcase: BriefcaseIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  database: DatabaseIcon,
  'file-text': FileTextIcon,
  flag: FlagIcon,
  folder: FolderIcon,
  gauge: GaugeIcon,
  list: ListIcon,
  puzzle: PuzzleIcon,
  settings: SettingsIcon,
  tag: TagIcon,
  timer: TimerIcon,
  users: UsersIcon,
  wallet: WalletIcon,
};

export function screenIconOf(name: string | undefined): LucideIcon {
  return (name !== undefined && SCREEN_ICONS[name]) || PuzzleIcon;
}
