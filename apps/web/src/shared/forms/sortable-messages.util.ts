import type { SortableListMessages } from '@toppo-tracker/ui';
import type { Translate } from '../i18n/i18n.types.ts';

/** What a sortable list says, in the reader's language. */
export function sortableMessages(t: Translate): SortableListMessages {
  return {
    move: (name) => t('sortable.move', { name }),
    roleDescription: t('sortable.roleDescription'),
    instructions: t('sortable.instructions'),
    picked: (name) => t('sortable.picked', { name }),
    over: (name, position, count) => t('sortable.over', { name, position, count }),
    dropped: (name, position, count) => t('sortable.dropped', { name, position, count }),
    cancelled: (name) => t('sortable.cancelled', { name }),
  };
}
