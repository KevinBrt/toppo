import {
  PROPERTY_VALUE_SCHEMAS,
  type PropertyType,
  type PropertyValue,
} from '@toppo-tracker/shared';

/** What decides the values a property takes: its type, its options, whether creating asks it. */
export interface PropertyRules {
  id: string;
  type: PropertyType;
  askedAtCreation: boolean;
  required: boolean;
  /** The options of a list or a multi-select where the issue is; none for the other types. */
  optionIds: readonly string[];
}

/** Why values cannot be given to an issue, and which property says so. */
export type PropertyProblem =
  | { problem: 'unknownProperty'; propertyId: string }
  | { problem: 'invalidValue'; propertyId: string }
  | { problem: 'unknownOption'; propertyId: string }
  | { problem: 'missingRequired'; propertyId: string };

/**
 * The value a property takes from what is given, as it is stored (a text trimmed), or why it
 * cannot: a value of another type, or an option the property does not have there. Whether
 * someone may be named is the server's to say: it knows who reaches the project.
 */
export function propertyValueOf(
  property: PropertyRules,
  given: unknown,
): { value: PropertyValue } | PropertyProblem {
  const parsed = PROPERTY_VALUE_SCHEMAS[property.type].safeParse(given);
  if (!parsed.success) {
    return { problem: 'invalidValue', propertyId: property.id };
  }
  const known = optionsIn(property.type, parsed.data).every((id) =>
    property.optionIds.includes(id),
  );
  return known ? { value: parsed.data } : { problem: 'unknownOption', propertyId: property.id };
}

/** The options a value chooses: one of a list, those of a multi-select, none of other types. */
export function optionsIn(type: PropertyType, value: PropertyValue): readonly string[] {
  if (type === 'list' && typeof value === 'string') {
    return [value];
  }
  if (type === 'multiSelect' && Array.isArray(value)) {
    return value;
  }
  return [];
}

/**
 * The values an issue is created with, as stored, or what is wrong with them: each must suit a
 * property of its project, and every property asked at creation and required must have one.
 * Properties not asked may be given too (an import, a plugin), checked the same way.
 */
export function creationValuesOf(
  properties: readonly PropertyRules[],
  given: Readonly<Record<string, unknown>>,
): { values: Record<string, PropertyValue> } | PropertyProblem {
  const values: Record<string, PropertyValue> = {};
  for (const [propertyId, value] of Object.entries(given)) {
    const property = properties.find(({ id }) => id === propertyId);
    if (!property) {
      return { problem: 'unknownProperty', propertyId };
    }
    const taken = propertyValueOf(property, value);
    if ('problem' in taken) {
      return taken;
    }
    values[propertyId] = taken.value;
  }
  const missing = properties.find(
    ({ id, askedAtCreation, required }) => askedAtCreation && required && !(id in values),
  );
  return missing ? { problem: 'missingRequired', propertyId: missing.id } : { values };
}

/** The people values name, through the person properties among them. */
export function peopleNamedIn(
  properties: readonly PropertyRules[],
  values: Readonly<Record<string, PropertyValue>>,
): string[] {
  return properties.flatMap(({ id, type }) => {
    const value = values[id];
    return type === 'user' && typeof value === 'string' ? [value] : [];
  });
}

/** An issue's values once `propertyId` takes `value`, or loses its value with `null`. */
export function withPropertyValue(
  values: Readonly<Record<string, PropertyValue>>,
  propertyId: string,
  value: PropertyValue | null,
): Record<string, PropertyValue> {
  const { [propertyId]: _, ...others } = values;
  return value === null ? others : { ...others, [propertyId]: value };
}
