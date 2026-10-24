import type { IssuePropertyValue, PropertyValue } from '@toppo/shared';

/** A property's value as the server stores it, from the value as it reads. */
export function storedValueOf(value: IssuePropertyValue): PropertyValue {
  switch (value.type) {
    case 'list':
    case 'user':
      return value.value.id;
    case 'multiSelect':
      return value.value.map(({ id }) => id);
    default:
      return value.value;
  }
}
