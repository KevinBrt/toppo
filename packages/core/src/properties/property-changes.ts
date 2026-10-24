import type { IssueActivityPayload, PropertyType, PropertyValue } from '@toppo/shared';
import { optionsIn } from './property-values.ts';

type Named = { id: string; name: string };

/**
 * A change of a property's value as history keeps it: options by the names they have now, so
 * that one renamed or deleted later still reads as it was; any other value as it is, someone by
 * id. An option no longer known reads as no value, as it shows on the issue.
 */
export function propertyChangeOf(
  property: Named & { type: PropertyType },
  from: PropertyValue | null,
  to: PropertyValue | null,
  optionNames: ReadonlyMap<string, string>,
): IssueActivityPayload<'issue.propertyChanged'> {
  const ref = { id: property.id, name: property.name };
  const named = (value: PropertyValue | null): Named[] =>
    value === null
      ? []
      : optionsIn(property.type, value).flatMap((id) => {
          const name = optionNames.get(id);
          return name === undefined ? [] : [{ id, name }];
        });
  const text = (value: PropertyValue | null) => (typeof value === 'string' ? value : null);
  switch (property.type) {
    case 'list':
      return {
        type: 'list',
        property: ref,
        from: named(from)[0] ?? null,
        to: named(to)[0] ?? null,
      };
    case 'multiSelect': {
      const [before, after] = [named(from), named(to)];
      return {
        type: 'multiSelect',
        property: ref,
        from: before.length > 0 ? before : null,
        to: after.length > 0 ? after : null,
      };
    }
    case 'number': {
      const number = (value: PropertyValue | null) => (typeof value === 'number' ? value : null);
      return { type: 'number', property: ref, from: number(from), to: number(to) };
    }
    case 'checkbox':
      return {
        type: 'checkbox',
        property: ref,
        from: from === true ? true : null,
        to: to === true ? true : null,
      };
    case 'text':
      return { type: 'text', property: ref, from: text(from), to: text(to) };
    case 'date':
      return { type: 'date', property: ref, from: text(from), to: text(to) };
    case 'user':
      return { type: 'user', property: ref, from: text(from), to: text(to) };
  }
}

/** Whether two values say the same: the options of a multi-select in any order. */
export function samePropertyValue(a: PropertyValue | null, b: PropertyValue | null): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.every((id) => b.includes(id)) && b.every((id) => a.includes(id));
  }
  return a === b;
}

/** A value once options are replaced by others (copies of them): each by its replacement. */
export function withOptionsMoved(
  type: PropertyType,
  value: PropertyValue,
  moves: ReadonlyMap<string, string>,
): PropertyValue {
  if (type === 'list' && typeof value === 'string') {
    return moves.get(value) ?? value;
  }
  if (type === 'multiSelect' && Array.isArray(value)) {
    return value.map((id) => moves.get(id) ?? id);
  }
  return value;
}

/**
 * A value once options leave it: a list's is none if it was one of them, a multi-select keeps
 * the others, or none once it has none left.
 */
export function withoutOptions(
  type: PropertyType,
  value: PropertyValue,
  removed: readonly string[],
): PropertyValue | null {
  const kept = optionsIn(type, value).filter((id) => !removed.includes(id));
  if (type === 'list') {
    return kept[0] ?? null;
  }
  if (type === 'multiSelect') {
    return kept.length > 0 ? kept : null;
  }
  return value;
}
