import {
  CircleDotIcon,
  ListIcon,
  PuzzleIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react';
import type { NavSection } from '../../../shared/layout/navigation.constants.ts';

/** Where a project sets what the plugins at work in it take of it. */
export const PROJECT_PLUGINS_PATH = '/projects/$projectKey/plugins';

/** A project's own pages, each shown to those who manage that part of it. */
export const PROJECT_ADMIN_NAV: readonly NavSection[] = [
  {
    items: [
      {
        to: '/projects/$projectKey',
        labelKey: 'projectAdmin.general',
        icon: SlidersHorizontalIcon,
        requiresAnyOf: ['project.settings.manage'],
        exact: true,
      },
      {
        to: '/projects/$projectKey/access',
        labelKey: 'projectAdmin.access',
        icon: UsersIcon,
        requiresAnyOf: ['project.members.manage'],
      },
      {
        to: '/projects/$projectKey/statuses',
        labelKey: 'projectAdmin.statuses',
        icon: CircleDotIcon,
        requiresAnyOf: ['project.settings.manage'],
      },
      {
        to: '/projects/$projectKey/properties',
        labelKey: 'projectAdmin.properties',
        icon: ListIcon,
        requiresAnyOf: ['project.settings.manage'],
      },
      // Shown once a plugin at work in the project takes settings of it.
      {
        to: PROJECT_PLUGINS_PATH,
        labelKey: 'projectAdmin.plugins',
        icon: PuzzleIcon,
        requiresAnyOf: ['project.settings.manage'],
      },
    ],
  },
];
