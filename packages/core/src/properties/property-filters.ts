import {
  PROPERTY_VALUE_SCHEMAS,
  type PropertyFilter,
  type PropertyType,
  type PropertyValue,
} from '@toppo/shared';

/**
 * What a filter keeps of a property, once checked against its type: any of some options or
 * people (or no value), a box ticked or not, or numbers or days within a range.
 */
export type PropertyCondition =
  | {
      kind: 'any';
      propertyId: string;
      ids: readonly string[];
      /** Issues with no value pass too. */
      none: boolean;
      /** The value holds several options: an id is one of them. */
      several: boolean;
    }
  | { kind: 'ticked'; propertyId: string; ticked: boolean }
  | { kind: 'between'; propertyId: string; type: 'number'; from: number | null; to: number | null }
  | { kind: 'between'; propertyId: string; type: 'date'; from: string | null; to: string | null };

/** The words values may hold for a type, besides ids; none for ids alone. */
const WORDS: Partial<Record<PropertyType, readonly string[]>> = {
  list: ['none'],
  multiSelect: ['none'],
  user: ['none', 'me'],
};

const isId = (value: string) => PROPERTY_VALUE_SCHEMAS.list.safeParse(value).success;

/**
 * What a filter keeps of a property, `me` standing for the caller, or `null` when its type cannot
 * be filtered so: options or people of a list, a multi-select or a person property; `yes` or
 * `no` for a checkbox; a range of numbers or of days. A line of text is never filtered: the
 * search finds words.
 */
export function propertyConditionOf(
  property: { id: string; type: PropertyType },
  filter: PropertyFilter,
  callerId: string,
): PropertyCondition | null {
  const propertyId = property.id;
  if ('values' in filter) {
    if (property.type === 'checkbox') {
      const [answer, ...others] = filter.values;
      return others.length === 0 && (answer === 'yes' || answer === 'no')
        ? { kind: 'ticked', propertyId, ticked: answer === 'yes' }
        : null;
    }
    const words = WORDS[property.type];
    if (!(words && filter.values.every((value) => isId(value) || words.includes(value)))) {
      return null;
    }
    const ids = filter.values
      .filter((value) => value !== 'none')
      .map((value) => (value === 'me' ? callerId : value));
    return {
      kind: 'any',
      propertyId,
      ids: [...new Set(ids)],
      none: filter.values.includes('none'),
      several: property.type === 'multiSelect',
    };
  }
  return rangeOf(property, filter.from, filter.to);
}

/** A range of numbers or of days, each end checked; `null` for another type. */
function rangeOf(
  { id: propertyId, type }: { id: string; type: PropertyType },
  from: string | null,
  to: string | null,
): PropertyCondition | null {
  if (type === 'number') {
    const ends = [from, to].map((end) => (end === null ? null : Number(end)));
    const [low = null, high = null] = ends;
    return ends.every((end) => end === null || Number.isFinite(end))
      ? { kind: 'between', propertyId, type, from: low, to: high }
      : null;
  }
  if (type === 'date') {
    const isDay = (end: string | null) =>
      end === null || PROPERTY_VALUE_SCHEMAS.date.safeParse(end).success;
    return isDay(from) && isDay(to) ? { kind: 'between', propertyId, type, from, to } : null;
  }
  return null;
}

/** Whether a value, or no value, passes a condition: as the database checks it, for tests. */
export function meetsCondition(
  condition: PropertyCondition,
  value: PropertyValue | undefined,
): boolean {
  switch (condition.kind) {
    case 'any': {
      if (value === undefined) {
        return condition.none;
      }
      const chosen = Array.isArray(value) ? value : [value];
      return chosen.some((id) => typeof id === 'string' && condition.ids.includes(id));
    }
    case 'ticked':
      return (value === true) === condition.ticked;
    case 'between':
      if (condition.type === 'number') {
        return typeof value === 'number' && within(value, condition.from, condition.to);
      }
      return typeof value === 'string' && within(value, condition.from, condition.to);
  }
}

/** Whether a number or a day lies within a range open on either side; days compare as text. */
function within<T extends number | string>(at: T, from: T | null, to: T | null): boolean {
  return (from === null || at >= from) && (to === null || at <= to);
}
