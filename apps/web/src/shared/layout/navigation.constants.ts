import type { LinkProps } from '@tanstack/react-router';
import type { Permission } from '@toppo-tracker/core';
import {
  CircleDotIcon,
  FolderKanbanIcon,
  InboxIcon,
  ListIcon,
  type LucideIcon,
  MailIcon,
  PuzzleIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UserIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';
import type { PlainMessageKey } from '../i18n/i18n.types.ts';

export interface NavItem {
  to: NonNullable<LinkProps['to']>;
  labelKey: PlainMessageKey;
  icon: LucideIcon;
  /** Shown only to users holding at least one of these permissions; to everyone when absent. */
  requiresAnyOf?: readonly Permission[];
  /** Also shown to those who manage a project, whatever their permissions in the instance. */
  orToProjectManagers?: true;
  /** Active on this very path only, not on the pages below it. */
  exact?: true;
}

/** Who a navigation is for: what they may do, and whether they manage a project. */
export interface NavAudience {
  permissions: readonly string[];
  managesProjects?: boolean;
}

export interface NavSection {
  /** Sections without a label are shown first, without a heading. */
  labelKey?: PlainMessageKey;
  items: readonly NavItem[];
}

/** An entry added as the app runs, its words already in the reader's language: a plugin's. */
export interface AddedNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to: NonNullable<LinkProps['to']>;
  params: Record<string, string>;
}

/** Entries added as the app runs, after the app's own, under their own heading. */
export interface AddedNavSection {
  key: string;
  label: string;
  items: readonly AddedNavItem[];
}

/** Each of these opens a part of the settings, from the instance's settings to its webhooks. */
export const SETTINGS_PERMISSIONS: readonly Permission[] = [
  'instance.settings.manage',
  'instance.mail.manage',
  'instance.users.manage',
  'instance.roles.manage',
  'instance.plugins.manage',
  'instance.webhooks.manage',
];

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [
      { to: '/issues', labelKey: 'nav.issues', icon: InboxIcon },
      { to: '/my-issues', labelKey: 'nav.myIssues', icon: UserIcon },
    ],
  },
  {
    labelKey: 'nav.workspace',
    items: [
      {
        to: '/projects',
        labelKey: 'nav.projects',
        icon: FolderKanbanIcon,
        requiresAnyOf: ['project.create'],
        orToProjectManagers: true,
      },
      {
        to: '/settings',
        labelKey: 'nav.settings',
        icon: SlidersHorizontalIcon,
        requiresAnyOf: SETTINGS_PERMISSIONS,
      },
    ],
  },
];

/** The settings' own navigation, beside their pages. */
export const SETTINGS_NAV: readonly NavSection[] = [
  {
    items: [
      {
        to: '/settings/members',
        labelKey: 'members.title',
        icon: UsersIcon,
        requiresAnyOf: ['instance.users.manage'],
      },
      {
        to: '/settings/roles',
        labelKey: 'roles.title',
        icon: ShieldCheckIcon,
        requiresAnyOf: ['instance.roles.manage'],
      },
    ],
  },
  {
    labelKey: 'settings.issuesSection',
    items: [
      {
        to: '/settings/statuses',
        labelKey: 'workflow.title',
        icon: CircleDotIcon,
        requiresAnyOf: ['instance.settings.manage'],
      },
      {
        to: '/settings/properties',
        labelKey: 'properties.title',
        icon: ListIcon,
        requiresAnyOf: ['instance.settings.manage'],
      },
    ],
  },
  {
    labelKey: 'settings.instanceSection',
    items: [
      {
        to: '/settings/email',
        labelKey: 'mail.title',
        icon: MailIcon,
        requiresAnyOf: ['instance.mail.manage'],
      },
      {
        to: '/settings/plugins',
        labelKey: 'plugins.title',
        icon: PuzzleIcon,
        requiresAnyOf: ['instance.plugins.manage'],
      },
      {
        to: '/settings/webhooks',
        labelKey: 'webhooks.title',
        icon: WebhookIcon,
        requiresAnyOf: ['instance.webhooks.manage'],
      },
    ],
  },
];
