import type { IssueWithProject } from '@toppo/shared';
import { InboxIcon, SlidersHorizontalIcon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import type { PaletteCommand } from '../models/palette.model.ts';
import { matchingCommands, paletteOptions } from './palette.util.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';

const ISSUES: PaletteCommand = { id: 'issues', label: 'Tickets', icon: InboxIcon, run: vi.fn() };
const SETTINGS: PaletteCommand = {
  id: 'settings',
  label: 'Paramètres',
  icon: SlidersHorizontalIcon,
  run: vi.fn(),
};

function issue(key: string): IssueWithProject {
  return {
    key,
    title: 'Broken link',
    status: { id: ID, name: 'New', color: 'gray', closes: false },
    category: { id: ID, name: 'Bug', color: 'gray' },
    priority: { id: ID, name: 'Normal', level: 2 },
    assignee: null,
    reporter: { id: ID, name: 'Ada' },
    createdAt: '2026-10-22T09:14:00.000Z',
    labels: [],
    properties: [],
    updatedAt: '2026-10-22T09:14:00.000Z',
    project: { key: 'WEB', name: 'Website', color: 'blue' },
  };
}

describe('matchingCommands', () => {
  it('offers every command before anything is typed', () => {
    expect(matchingCommands([ISSUES, SETTINGS], '  ')).toStrictEqual([ISSUES, SETTINGS]);
  });

  it('keeps those whose name contains what is typed, ignoring case and accents', () => {
    expect(matchingCommands([ISSUES, SETTINGS], 'PARAMETRES')).toStrictEqual([SETTINGS]);
    expect(matchingCommands([ISSUES, SETTINGS], 'ick')).toStrictEqual([ISSUES]);
  });
});

describe('paletteOptions', () => {
  it('lists the issues found, then the matching commands', () => {
    const found = issue('WEB-1');

    expect(paletteOptions('tick', [found], [ISSUES, SETTINGS])).toStrictEqual([
      { kind: 'issue', issue: found },
      { kind: 'command', command: ISSUES },
    ]);
  });

  it('offers to open the issue a key names, first, until the search finds it', () => {
    expect(paletteOptions(' web-42 ', [], [])).toStrictEqual([{ kind: 'key', key: 'WEB-42' }]);
    expect(paletteOptions('WEB-42', [issue('WEB-42')], [])).toStrictEqual([
      { kind: 'issue', issue: issue('WEB-42') },
    ]);
  });
});
