import { CircleDotIcon, ListIcon, SlidersHorizontalIcon, UsersIcon } from 'lucide-react';
import type { NavSection } from '../../../shared/layout/navigation.constants.ts';

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
    ],
  },
];
