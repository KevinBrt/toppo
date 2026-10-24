/** What decides the values a property takes: its options, and whether creating asks for it. */
export interface PropertyRules {
  id: string;
  askedAtCreation: boolean;
  required: boolean;
  optionIds: readonly string[];
}

/** Why values cannot be given to an issue, and which property says so. */
export type PropertyProblem =
  | { problem: 'unknownProperty'; propertyId: string }
  | { problem: 'unknownOption'; propertyId: string }
  | { problem: 'missingRequired'; propertyId: string };

/**
 * What is wrong with the values an issue is created with, if anything: each must be an option of
 * a property of the instance, and every property asked at creation and required must have one.
 * Properties not asked may be given too (an import, a plugin), checked the same way.
 */
export function creationValuesProblem(
  properties: readonly PropertyRules[],
  values: Readonly<Record<string, string>>,
): PropertyProblem | null {
  for (const [propertyId, optionId] of Object.entries(values)) {
    const property = properties.find(({ id }) => id === propertyId);
    if (!property) {
      return { problem: 'unknownProperty', propertyId };
    }
    if (!property.optionIds.includes(optionId)) {
      return { problem: 'unknownOption', propertyId };
    }
  }
  const missing = properties.find(
    ({ id, askedAtCreation, required }) => askedAtCreation && required && !(id in values),
  );
  return missing ? { problem: 'missingRequired', propertyId: missing.id } : null;
}

/** An issue's values once `propertyId` takes `optionId`, or loses its value with `null`. */
export function withPropertyValue(
  values: Readonly<Record<string, string>>,
  propertyId: string,
  optionId: string | null,
): Record<string, string> {
  const { [propertyId]: _, ...others } = values;
  return optionId === null ? others : { ...others, [propertyId]: optionId };
}
